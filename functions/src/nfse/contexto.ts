/**
 * Leitura do contexto fiscal de um cliente (config, cadastro, certificado A1)
 * — uma cópia só, usada por emitir.ts, ciclo.ts e reconciliacao.ts (antes
 * cada arquivo tinha a sua).
 */
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { decrypt, isEncrypted } from './encrypt'
import { assertCaminhoCertificado, pfxBase64DoArquivoStorage } from './certificado'
import { escolherDocConfigFiscal } from './config-fiscal'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import type { OperacaoFiscal } from './provedor'
import { requireEnvironmentTenant } from '../tenant'
import type { CertificadoA1, ConfigFiscalCliente, Prestador } from './types'

const db = () => getFirestore()

/**
 * Documento de `clientes_fiscal` do cliente — leitura tolerante (config-fiscal.ts):
 * primeiro o doc de id = clienteId (padrão desde 2026-11-06); sem ele, os
 * antigos de auto-id, escolhidos de forma determinística (mais recente), não
 * mais o `limit(1)` que devolvia qualquer um.
 */
export async function localizarDocConfigFiscal(clienteId: string): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const col = db().collection('clientes_fiscal')
  const porId = await col.doc(clienteId).get()
  if (porId.exists && porId.data()?.clienteId === clienteId) return porId
  const snap = await col.where('clienteId', '==', clienteId).limit(20).get()
  const escolhido = escolherDocConfigFiscal(clienteId, snap.docs.map((d) => ({ id: d.id, data: d.data(), snap: d })))
  return escolhido?.snap ?? null
}

export async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const doc = await localizarDocConfigFiscal(clienteId)
  if (!doc) throw new HttpsError('not-found', 'Configuração fiscal do cliente não encontrada. Configure em Clientes → Fiscal.')
  const data = doc.data() ?? {}
  return { clienteId, ...data, tenantId: requireEnvironmentTenant(data.tenantId, 'Configuração fiscal') } as ConfigFiscalCliente
}

export async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente não encontrado.')
  return { id: doc.id, ...doc.data() } as Record<string, unknown>
}

function decryptSenhaCertificado(senhaRaw: string | undefined): string {
  if (!senhaRaw) return ''
  if (!isEncrypted(senhaRaw)) {
    throw new HttpsError(
      'failed-precondition',
      'Senha do certificado em formato legado não criptografado. Reenvie o certificado A1 para salvar a credencial com criptografia.'
    )
  }
  const senha = decrypt(senhaRaw)
  if (!senha) {
    throw new HttpsError(
      'failed-precondition',
      'Não foi possível descriptografar a senha do certificado. Verifique o secret CREDENTIAL_KEY e reenvie o certificado A1.'
    )
  }
  return senha
}

export async function getCertificado(config: ConfigFiscalCliente): Promise<CertificadoA1 | undefined> {
  const pathPersistido = config.credenciais?.certificadoStoragePath
  // Sem certificado = o roteador recusa a emissão com mensagem clara (o Ambiente
  // Nacional exige o A1). Se HÁ caminho, ele não pode ser usado cru:
  // assertCaminhoCertificado confere contra o derivado de clienteId e devolve o
  // derivado (ver certificado.ts).
  if (!pathPersistido) return undefined
  const path = assertCaminhoCertificado(config.clienteId, pathPersistido)
  const file = getStorage().bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()
  return {
    // Envelope cifrado (atual) ou legado em claro.
    pfxBase64: pfxBase64DoArquivoStorage(buffer),
    senha: decryptSenhaCertificado(config.credenciais?.certificadoSenha as string | undefined),
  }
}

export function montarPrestador(config: ConfigFiscalCliente, cliente: Record<string, unknown>): Prestador {
  return {
    cnpj: String(cliente.cpfCnpj ?? '').replace(/\D/g, ''),
    inscricaoMunicipal: config.inscricaoMunicipal,
    razaoSocial: cliente.razaoSocial as string,
    municipioIbge: config.municipioIbge,
  }
}

/** Config + prestador + A1 para consultar/cancelar, com a trava de produção. */
export async function montarContextoFiscal(clienteId: string | undefined, operacao: Exclude<OperacaoFiscal, 'emissao'>) {
  if (!clienteId) throw new HttpsError('failed-precondition', 'NFS-e sem clienteId.')
  const [config, cliente] = await Promise.all([getConfigFiscal(clienteId), getCliente(clienteId)])
  if (config.ambienteEmissao === 'producao' && !(await isProducaoLiberadaPorConfigOuConector(config, operacao))) {
    throw new HttpsError('failed-precondition', 'Ambiente Nacional ainda não liberado para produção (Administração → Ambiente Nacional).')
  }
  return { config, cliente, prestador: montarPrestador(config, cliente), cert: await getCertificado(config) }
}
