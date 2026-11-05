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
 * PDF já pronto para abrir sem chamar o servidor. Um DANFSe gerado antes do
 * cancelamento não serve para a nota cancelada (falta a marca "CANCELADA").
 */
export function pdfProntoDaNota(nota: NotaComArquivos): string | null {
  const url = typeof nota.pdfUrl === 'string' && nota.pdfUrl ? nota.pdfUrl : null
  if (!url) return null
  if (nota.pdfOrigem === 'plataforma' && nota.status === 'cancelada' && nota.pdfCancelada !== true) return null
  return url
}

/** Pode haver DANFSe: PDF pronto ou XML para gerá-lo. */
export function podeObterDanfse(nota: NotaComArquivos): boolean {
  return Boolean(pdfProntoDaNota(nota)) || temXmlNfse(nota)
}

export async function gerarDanfse(nfseId: string): Promise<string> {
  const fn = httpsCallable<{ nfseId: string }, { status: string; message: string; data?: { pdfUrl?: string } }>(
    getFunctions(getFirebaseApp(), 'southamerica-east1'),
    'gerarDanfse',
  )
  const { data } = await fn({ nfseId })
  const url = data?.data?.pdfUrl
  if (!url) throw new Error(data?.message || 'O servidor não devolveu o endereço do DANFSe.')
  return url
}
