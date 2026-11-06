/**
 * DANFSe gerado pela plataforma: lê o XML oficial gravado em nfse_emitidas,
 * renderiza o PDF, guarda no Storage em caminho determinístico e grava
 * pdfPath na nota. Usado pelos callables obterUrlDanfse/gerarDanfse e, em
 * modo best-effort, logo após a emissão (processarEmissao).
 *
 * Sem URL permanente (2026-11-06): antes o arquivo ganhava um token de
 * download do Storage e a nota guardava `pdfUrl` com ele — link que ignora
 * storage.rules e vale para sempre na mão de quem o copiou. Agora não há token;
 * quem pode ler a nota pede uma URL assinada de 5 minutos (urlAssinadaDanfse).
 *
 * Por que geramos: a API de DANFSe do ADN foi sobrestada (NT 008/2026), então
 * o PDF oficial deixou de existir — o DANFSe passa a ser responsabilidade do
 * software emissor.
 */
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { DanfseXmlInvalidoError, montarDadosDanfse } from './dados'
import { renderizarDanfsePdf } from './render'

const db = () => admin.firestore()

export interface ResultadoDanfse {
  pdfPath: string
  nomeArquivo: string
  reutilizado: boolean
}

/** Validade da URL assinada devolvida ao navegador. */
export const VALIDADE_URL_DANFSE_MS = 5 * 60_000

/** nfse/{clienteId}/{chave}.pdf — a versão cancelada ganha sufixo próprio. */
export function caminhoDanfse(clienteId: string, chave: string, cancelada: boolean): string {
  const seguro = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '')
  return `nfse/${seguro(clienteId)}/${seguro(chave)}${cancelada ? '-cancelada' : ''}.pdf`
}

/** URL de download com token do Storage — o formato que NÃO usamos mais. */
export function ehUrlComTokenDoStorage(url: unknown): boolean {
  return typeof url === 'string' && url.includes('firebasestorage.googleapis.com') && /[?&]token=/.test(url)
}

/**
 * URL assinada (V4) de leitura, curta. Exige que a conta de serviço das
 * functions possa assinar (roles/iam.serviceAccountTokenCreator nela mesma);
 * sem isso lança — o callable cai para devolver o PDF em base64.
 */
export async function urlAssinadaDanfse(pdfPath: string, nomeArquivo: string): Promise<{ url: string; expiraEm: string }> {
  const expires = Date.now() + VALIDADE_URL_DANFSE_MS
  const [url] = await getStorage().bucket().file(pdfPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires,
    responseDisposition: `inline; filename="${nomeArquivo}"`,
    responseType: 'application/pdf',
  })
  return { url, expiraEm: new Date(expires).toISOString() }
}

export async function lerPdfDanfse(pdfPath: string): Promise<Buffer> {
  const [conteudo] = await getStorage().bucket().file(pdfPath).download()
  return conteudo
}

export function nomeArquivoDanfse(numero: string | undefined, chave: string): string {
  return `DANFSe-${(numero ?? 'sem-numero').replace(/[^\w-]/g, '')}-${chave}.pdf`
}

/**
 * Gera (ou reaproveita) o DANFSe da nota. Lança DanfseXmlInvalidoError quando
 * a nota não tem XML do padrão nacional.
 */
export async function gerarESalvarDanfse(nfseId: string, opcoes: { forcar?: boolean } = {}): Promise<ResultadoDanfse> {
  const ref = db().collection('nfse_emitidas').doc(nfseId)
  const snap = await ref.get()
  if (!snap.exists) throw new DanfseXmlInvalidoError('NFS-e não encontrada.')
  const nota = snap.data() ?? {}
  const xml = nota.xmlNfse as string | undefined
  if (!xml) throw new DanfseXmlInvalidoError('Esta NFS-e não tem o XML oficial gravado; não é possível gerar o DANFSe.')
  const clienteId = nota.clienteId as string | undefined
  if (!clienteId) throw new DanfseXmlInvalidoError('NFS-e sem clienteId.')

  const dados = montarDadosDanfse(xml)
  const cancelada = nota.status === 'cancelada'
  const pdfPath = caminhoDanfse(clienteId, dados.chaveAcesso, cancelada)
  const bucket = getStorage().bucket()

  const nomeArquivo = nomeArquivoDanfse(dados.identificacao.numeroNfse, dados.chaveAcesso)
  // PDF já gerado no mesmo caminho e sem o link permanente antigo: reaproveita.
  // Com pdfUrl de token (gerado antes de 2026-11-06), regrava sem token — o
  // save() substitui o objeto e o token antigo deixa de valer.
  if (!opcoes.forcar && nota.pdfPath === pdfPath && !ehUrlComTokenDoStorage(nota.pdfUrl)) {
    const [existe] = await bucket.file(pdfPath).exists()
    if (existe) return { pdfPath, nomeArquivo, reutilizado: true }
  }

  const pdf = await renderizarDanfsePdf(dados, { cancelada })
  await bucket.file(pdfPath).save(pdf, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      contentDisposition: `inline; filename="${nomeArquivo}"`,
      cacheControl: 'private, max-age=300',
      metadata: {
        nfseId,
        chaveAcesso: dados.chaveAcesso,
        geradoPor: 'plataforma',
      },
    },
  })
  await ref.update({
    // Some com o link permanente; o PDF é pedido pelo callable a cada abertura.
    pdfUrl: FieldValue.delete(),
    pdfPath,
    pdfOrigem: 'plataforma',
    pdfCancelada: cancelada,
    pdfGeradoEm: Timestamp.now(),
  })
  return { pdfPath, nomeArquivo, reutilizado: false }
}
