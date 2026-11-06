/**
 * Arquivos da NFS-e emitida, no navegador: XML oficial (download direto do
 * campo xmlNfse) e DANFSe em PDF (gerado no servidor pelo callable gerarDanfse).
 */
import { getFunctions, httpsCallable } from 'firebase/functions'

import { getFirebaseApp } from '@/lib/firebase'

type NotaComArquivos = Record<string, unknown>

/**
 * Consulta pública oficial. O formato com `?tpc=1&chave=` é o endereço que a
 * NT 008/2026 (SE/CGNFS-e, item 2.4.3) manda gravar no QR Code do DANFSe.
 */
export const URL_CONSULTA_PUBLICA_NFSE = 'https://www.nfse.gov.br/ConsultaPublica/'

export function urlConsultaPublicaNfse(chave: string): string {
  return `${URL_CONSULTA_PUBLICA_NFSE}?tpc=1&chave=${encodeURIComponent(chave)}`
}

const CHAVE_50 = /^\d{50}$/

/** Chave de acesso de 50 dígitos: campo da nota ou o Id do XML (sem "NFS"). */
export function chaveAcessoDaNota(nota: NotaComArquivos): string | null {
  for (const campo of ['chaveAcesso', 'codigoVerificacao'] as const) {
    const valor = typeof nota[campo] === 'string' ? (nota[campo] as string).trim() : ''
    if (CHAVE_50.test(valor)) return valor
  }
  const xml = typeof nota.xmlNfse === 'string' ? nota.xmlNfse : ''
  const m = /<infNFSe\b[^>]*\bId="NFS(\d{50})"/.exec(xml)
  return m ? m[1] : null
}

export function temXmlNfse(nota: NotaComArquivos): boolean {
  return typeof nota.xmlNfse === 'string' && nota.xmlNfse.trim().length > 0
}

function parteSegura(valor: string): string {
  return valor.replace(/[^\w-]/g, '')
}

export function nomeArquivoXmlNfse(nota: NotaComArquivos): string {
  const numero = typeof nota.numeroNfse === 'string' || typeof nota.numeroNfse === 'number'
    ? parteSegura(String(nota.numeroNfse))
    : ''
  const chave = chaveAcessoDaNota(nota)
  const partes = ['NFSe', numero || 'sem-numero', chave ?? (typeof nota.id === 'string' ? parteSegura(nota.id) : '')]
  return `${partes.filter(Boolean).join('-')}.xml`
}

/** Baixa o XML oficial (UTF-8) sem passar pelo servidor. */
export function baixarXmlNfse(nota: NotaComArquivos): void {
  if (!temXmlNfse(nota)) throw new Error('Esta NFS-e não tem XML gravado.')
  const blob = new Blob([nota.xmlNfse as string], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivoXmlNfse(nota)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * PDF já pronto para abrir sem chamar o servidor — só o link do PROVEDOR
 * (prefeitura). O DANFSe gerado pela plataforma não tem mais link permanente:
 * é pedido a cada abertura ao callable obterUrlDanfse, que confere a permissão
 * e devolve uma URL de 5 minutos. `pdfUrl` antigo da plataforma (com token do
 * Storage, de antes de 2026-11-06) é ignorado de propósito.
 */
export function pdfProntoDaNota(nota: NotaComArquivos): string | null {
  const url = typeof nota.pdfUrl === 'string' && nota.pdfUrl ? nota.pdfUrl : null
  if (!url) return null
  if (nota.pdfOrigem === 'plataforma') return null
  if (url.includes('firebasestorage.googleapis.com')) return null
  return url
}

/** Pode haver DANFSe: PDF do provedor ou XML para o servidor gerá-lo. */
export function podeObterDanfse(nota: NotaComArquivos): boolean {
  return Boolean(pdfProntoDaNota(nota)) || temXmlNfse(nota)
}

type RespostaDanfse = {
  status: string
  message: string
  data?: { pdfUrl?: string; pdfBase64?: string; nomeArquivo?: string }
}

/** PDF devolvido em base64 (servidor sem permissão de assinar URL) → blob: local. */
export function urlDeBase64Pdf(base64: string): string {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  // A aba aberta já carregou o PDF; o blob some depois de um tempo.
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  return url
}

/**
 * Endereço de curta duração do DANFSe: gera o PDF se preciso e devolve uma URL
 * assinada de 5 minutos (ou o PDF, que vira blob: local). Nada fica gravado.
 */
export async function gerarDanfse(nfseId: string): Promise<string> {
  const fn = httpsCallable<{ nfseId: string }, RespostaDanfse>(
    getFunctions(getFirebaseApp(), 'southamerica-east1'),
    'obterUrlDanfse',
  )
  const { data } = await fn({ nfseId })
  if (data?.data?.pdfUrl) return data.data.pdfUrl
  if (data?.data?.pdfBase64) return urlDeBase64Pdf(data.data.pdfBase64)
  throw new Error(data?.message || 'O servidor não devolveu o DANFSe.')
}
