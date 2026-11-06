import * as admin from 'firebase-admin'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

import { assertCanAccessCliente } from '../../authz'
import { DanfseXmlInvalidoError } from './dados'
import { gerarESalvarDanfse, lerPdfDanfse, urlAssinadaDanfse } from './servico'

const OPCOES = { region: 'southamerica-east1', timeoutSeconds: 60, memory: '512MiB' as const, invoker: 'public' as const }

/**
 * Quem lê a NFS-e pode obter o DANFSe (é uma representação do XML que ele já
 * lê): perfil fiscal/financeiro/admin ou a tela 'fiscal' concedida — o mesmo
 * critério de canReadNfse() em firestore.rules e de nfse/ em storage.rules.
 * Escrita só pelo Admin SDK.
 */
async function prepararDanfse(request: CallableRequest) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const { nfseId } = (request.data ?? {}) as { nfseId?: unknown }
  if (typeof nfseId !== 'string' || !nfseId.trim()) {
    throw new HttpsError('invalid-argument', 'nfseId obrigatório.')
  }

  const snap = await admin.firestore().collection('nfse_emitidas').doc(nfseId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'NFS-e não encontrada.')
  await assertCanAccessCliente(request.auth.uid, snap.data()?.clienteId as string | undefined, 'nfse')

  try {
    return await gerarESalvarDanfse(nfseId)
  } catch (err) {
    if (err instanceof DanfseXmlInvalidoError) throw new HttpsError('failed-precondition', err.message)
    console.error('[danfse] falha ao gerar DANFSe', { nfseId, err })
    throw new HttpsError('internal', 'Não foi possível gerar o DANFSe. Tente novamente em instantes.')
  }
}

/**
 * Endereço de curta duração do PDF. URL assinada de 5 min; se a conta de
 * serviço ainda não puder assinar (IAM — ver docs/USUARIOS-PERMISSOES.md),
 * devolve o próprio PDF em base64 para o navegador abrir sem link nenhum.
 */
async function entregar(resultado: Awaited<ReturnType<typeof gerarESalvarDanfse>>) {
  try {
    const { url, expiraEm } = await urlAssinadaDanfse(resultado.pdfPath, resultado.nomeArquivo)
    return { pdfUrl: url, expiraEm, nomeArquivo: resultado.nomeArquivo, reutilizado: resultado.reutilizado }
  } catch (err) {
    console.warn('[danfse] URL assinada indisponível, devolvendo o PDF', err instanceof Error ? err.message : err)
    const pdf = await lerPdfDanfse(resultado.pdfPath)
    return { pdfBase64: pdf.toString('base64'), nomeArquivo: resultado.nomeArquivo, reutilizado: resultado.reutilizado }
  }
}

/** obterUrlDanfse({ nfseId }) → { pdfUrl (5 min) | pdfBase64, nomeArquivo, expiraEm } */
export const obterUrlDanfse = onCall(OPCOES, async (request) => {
  const resultado = await prepararDanfse(request)
  return { status: 'success', message: 'DANFSe disponível.', data: await entregar(resultado) }
})

/**
 * Nome antigo, mantido para o front que ainda estiver em cache durante o
 * deploy: mesmo contrato de resposta ({ data: { pdfUrl } }), agora com URL
 * curta em vez do link permanente.
 */
export const gerarDanfse = onCall(OPCOES, async (request) => {
  const resultado = await prepararDanfse(request)
  return { status: 'success', message: 'DANFSe disponível.', data: await entregar(resultado) }
})
