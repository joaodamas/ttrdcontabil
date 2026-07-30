/**
 * Envia para a Spedy o certificado A1 que já está guardado na plataforma.
 *
 * A plataforma guarda o .pfx cifrado no Storage (mesmo fluxo do uploadCertificado
 * usado pelos conectores municipais). Para a Spedy assinar NF-e (modelo 55), o
 * mesmo certificado precisa estar carregado na empresa correspondente da Spedy.
 * Esta callable lê o cert guardado, descriptografa a senha e repassa via
 * SpedyConector.subirCertificado — o certificado NUNCA transita pelo navegador,
 * sai direto Storage → função → Spedy. É a peça que fecha o "cofre único": o
 * contador sobe o A1 uma vez na plataforma e ela alimenta a Spedy.
 *
 * Pré-requisitos no clientes_fiscal:
 *  - provedorNfse === 'spedy'
 *  - spedyCompanyId (empresa já criada na Spedy — via provisionamento)
 *  - credenciais.spedyApiKey (chave da empresa)
 *  - certificado A1 já carregado (credenciais.certificadoStoragePath + senha)
 *
 * Acesso: perfil 'admin'. É a operação que exporta a chave privada do cliente
 * para fora da plataforma, então não basta ser do fiscal.
 */
import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { decrypt, isEncrypted } from './encrypt'
import { credentialSecrets } from './secrets'
import { assertCaminhoCertificado, pfxBase64FromStorageBuffer } from './certificado'
import { SpedyConector } from './provedores/spedy'
import { assertCanAccessCliente } from '../authz'
import { writeAuditLog, type AuditActor } from '../audit'
import { DEFAULT_TENANT_ID } from '../tenant'
import type { ConfigFiscalCliente } from './types'

const db = () => admin.firestore()

// spedyCompanyId é gravado no doc pelo provisionamento; não faz parte do tipo base.
type FiscalComSpedy = ConfigFiscalCliente & { spedyCompanyId?: string }

async function getFiscalSnap(clienteId: string) {
  const snap = await db().collection('clientes_fiscal').where('clienteId', '==', clienteId).limit(1).get()
  return snap.empty ? null : snap.docs[0]
}

// Mesma regra do emitir.ts: senha precisa estar criptografada (rejeita legado plano).
function decryptSenhaCertificado(senhaRaw: string | undefined): string {
  if (!senhaRaw) {
    throw new HttpsError('failed-precondition', 'Senha do certificado ausente. Reenvie o certificado A1 na ficha fiscal.')
  }
  if (!isEncrypted(senhaRaw)) {
    throw new HttpsError(
      'failed-precondition',
      'Senha do certificado em formato legado não criptografado. Reenvie o certificado A1 para salvar a credencial com criptografia.',
    )
  }
  const senha = decrypt(senhaRaw)
  if (!senha) {
    throw new HttpsError(
      'failed-precondition',
      'Não foi possível descriptografar a senha do certificado. Verifique o secret CREDENTIAL_KEY e reenvie o certificado A1.',
    )
  }
  return senha
}

export const enviarCertificadoSpedy = onCall(
  { region: 'southamerica-east1', memory: '256MiB', timeoutSeconds: 120, secrets: credentialSecrets },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const uid = request.auth.uid
    const clienteId = String((request.data as { clienteId?: string } | undefined)?.clienteId ?? '')
    if (!clienteId) throw new HttpsError('invalid-argument', 'clienteId é obrigatório.')

    // Exige 'admin', não 'fiscal': esta callable é a única que tira o .pfx e a
    // senha em texto puro do cofre e entrega a um terceiro (Spedy). Quem opera o
    // dia a dia fiscal emite nota, mas não exporta a chave privada do cliente.
    const acesso = await assertCanAccessCliente(uid, clienteId, 'admin')
    const actor: AuditActor = { id: uid, nome: acesso.usuario.nome, email: null }

    const fiscalSnap = await getFiscalSnap(clienteId)
    if (!fiscalSnap) throw new HttpsError('failed-precondition', 'Cliente sem configuração fiscal (clientes_fiscal).')
    const config = fiscalSnap.data() as FiscalComSpedy

    if (config.provedorNfse !== 'spedy') {
      throw new HttpsError('failed-precondition', 'Provedor de emissão do cliente não é a Spedy.')
    }
    const companyId = String(config.spedyCompanyId ?? '')
    if (!companyId) {
      throw new HttpsError(
        'failed-precondition',
        'Cliente sem spedyCompanyId. Provisione a empresa na Spedy (ou cadastre o ID) antes de enviar o certificado.',
      )
    }
    if (!config.credenciais?.spedyApiKey) {
      throw new HttpsError('failed-precondition', 'Cliente sem chave de API da Spedy configurada.')
    }

    const pathPersistido = config.credenciais?.certificadoStoragePath
    if (!pathPersistido) {
      throw new HttpsError('failed-precondition', 'Nenhum certificado carregado para este cliente. Suba o A1 na ficha fiscal antes.')
    }
    // O campo só diz SE existe certificado; QUAL arquivo baixar é derivado do
    // clienteId no servidor. Ver assertCaminhoCertificado em ./certificado.
    const caminhoCertificado = assertCaminhoCertificado(clienteId, pathPersistido)
    const file = getStorage().bucket().file(caminhoCertificado)
    const [exists] = await file.exists()
    if (!exists) throw new HttpsError('failed-precondition', 'Arquivo do certificado não encontrado no Storage.')
    const [buffer] = await file.download()
    const pfxBase64 = pfxBase64FromStorageBuffer(buffer)
    const senha = decryptSenhaCertificado(config.credenciais?.certificadoSenha as string | undefined)

    const resultado = await new SpedyConector().subirCertificado(config, companyId, pfxBase64, senha)

    await writeAuditLog({
      tenantId: DEFAULT_TENANT_ID,
      actor,
      entidade: 'clientes_fiscal',
      entidadeId: clienteId,
      acao: 'enviar_certificado_spedy',
      dadosDepois: { spedyCompanyId: companyId, sucesso: resultado.sucesso, status: resultado.status },
      origem: 'cloud_function',
    })

    if (!resultado.sucesso) {
      throw new HttpsError('internal', resultado.erro ?? 'Falha ao enviar o certificado para a Spedy.', resultado.detalhes)
    }

    await fiscalSnap.ref.update({ spedyCertificadoEnviadoEm: FieldValue.serverTimestamp() })
    return { sucesso: true, spedyCompanyId: companyId }
  },
)
