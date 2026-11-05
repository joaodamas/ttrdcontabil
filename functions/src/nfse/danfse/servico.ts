/**
 * DANFSe gerado pela plataforma: lê o XML oficial gravado em nfse_emitidas,
 * renderiza o PDF, guarda no Storage em caminho determinístico e grava
 * pdfUrl/pdfPath na nota. Usado pelo callable gerarDanfse e, em modo
 * best-effort, logo após a emissão (processarEmissao).
 *
 * Por que geramos: a API de DANFSe do ADN foi sobrestada (NT 008/2026), então
 * o PDF oficial deixou de existir — o DANFSe passa a ser responsabilidade do
 * software emissor.
 */
import { randomUUID } from 'node:crypto'
import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { DanfseXmlInvalidoError, montarDadosDanfse } from './dados'
import { renderizarDanfsePdf } from './render'

const db = () => admin.firestore()

export interface ResultadoDanfse {
  pdfUrl: string
  pdfPath: string
  reutilizado: boolean
}

/** nfse/{clienteId}/{chave}.pdf — a versão cancelada ganha sufixo próprio. */
export function caminhoDanfse(clienteId: string, chave: string, cancelada: boolean): string {
  const seguro = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '')
  return `nfse/${seguro(clienteId)}/${seguro(chave)}${cancelada ? '-cancelada' : ''}.pdf`
}

/** URL de download com token (mesmo formato do getDownloadURL do SDK web). */
function urlComToken(bucket: string, caminho: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`
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

  if (!opcoes.forcar && nota.pdfPath === pdfPath && typeof nota.pdfUrl === 'string' && nota.pdfUrl) {
    const [existe] = await bucket.file(pdfPath).exists()
    if (existe) return { pdfUrl: nota.pdfUrl, pdfPath, reutilizado: true }
  }

  const pdf = await renderizarDanfsePdf(dados, { cancelada })
  const token = randomUUID()
  const nomeArquivo = nomeArquivoDanfse(dados.identificacao.numeroNfse, dados.chaveAcesso)
  await bucket.file(pdfPath).save(pdf, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      contentDisposition: `inline; filename="${nomeArquivo}"`,
      cacheControl: 'private, max-age=300',
      metadata: {
        firebaseStorageDownloadTokens: token,
        nfseId,
        chaveAcesso: dados.chaveAcesso,
        geradoPor: 'plataforma',
      },
    },
  })
  const pdfUrl = urlComToken(bucket.name, pdfPath, token)
  await ref.update({
    pdfUrl,
    pdfPath,
    pdfOrigem: 'plataforma',
    pdfCancelada: cancelada,
    pdfGeradoEm: Timestamp.now(),
  })
  return { pdfUrl, pdfPath, reutilizado: false }
}
