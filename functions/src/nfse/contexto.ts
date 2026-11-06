/**
 * Leitura do contexto fiscal de um cliente (config, cadastro, certificado A1)
 * — uma cópia só, usada por emitir.ts, ciclo.ts e reconciliacao.ts (antes
 * cada arquivo tinha a sua).
 */
import * as admin from 'firebase-admin'
import { HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { decrypt, isEncrypted } from './encrypt'
import { assertCaminhoCertificado, pfxBase64FromStorageBuffer } from './certificado'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import type { OperacaoFiscal } from './provedor'
import { requireEnvironmentTenant } from '../tenant'
import type { CertificadoA1, ConfigFiscalCliente, Prestador } from './types'

const db = () => admin.firestore()

export async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId)
    .limit(1)
    .get()
  if (snap.empty) throw new HttpsError('not-found', 'Configuração fiscal do cliente não encontrada. Configure em Clientes → Fiscal.')
  const data = snap.docs[0].data()
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
  // Sem certificado é caminho legítimo (município autenticado por token) — segue
  // sem A1. Mas se HÁ caminho, ele não pode ser usado cru: assertCaminhoCertificado
  // confere contra o derivado de clienteId e devolve o derivado (ver certificado.ts).
  if (!pathPersistido) return undefined
  const path = assertCaminhoCertificado(config.clienteId, pathPersistido)
  const file = getStorage().bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()
  return {
    pfxBase64: pfxBase64FromStorageBuffer(buffer),
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
    throw new HttpsError('failed-precondition', 'Município/configuração fiscal ainda não liberado para produção.')
  }
  return { config, cliente, prestador: montarPrestador(config, cliente), cert: await getCertificado(config) }
}
