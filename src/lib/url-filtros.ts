/**
 * Utilitários puros para filtros de lista guardados na URL.
 *
 * Toda lista do app guarda os filtros na query string (Voltar e links
 * compartilhados mantêm o filtro). Remover um filtro = mesmo endereço sem a
 * chave; a paginação volta para a primeira página.
 */

type ParamsLike = URLSearchParams | string | { toString(): string }

/** Endereço `base` com a query atual menos `chaves` (e sem `page`). */
export function hrefSemFiltro(base: string, params: ParamsLike, chaves: string | string[]): string {
  const p = new URLSearchParams(typeof params === 'string' ? params : params.toString())
  for (const chave of Array.isArray(chaves) ? chaves : [chaves]) p.delete(chave)
  p.delete('page')
  const q = p.toString()
  return q ? `${base}?${q}` : base
}

/** Endereço `base` com a query atual trocando/removendo chaves ('' ou null remove). */
export function hrefComFiltro(
  base: string,
  params: ParamsLike,
  mudancas: Record<string, string | number | null | undefined>,
): string {
  const p = new URLSearchParams(typeof params === 'string' ? params : params.toString())
  for (const [k, v] of Object.entries(mudancas)) {
    if (v === null || v === undefined || v === '') p.delete(k)
    else p.set(k, String(v))
  }
  if (!('page' in mudancas)) p.delete('page')
  const q = p.toString()
  return q ? `${base}?${q}` : base
}

/** Mês anterior/seguinte, atravessando o ano. */
export function deslocarMes(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  const indice = ano * 12 + (mes - 1) + delta
  return { mes: (indice % 12) + 1, ano: Math.floor(indice / 12) }
}

/** Lê um inteiro da URL; ausente, vazio ou inválido = null. */
export function inteiroDaUrl(valor: string | null | undefined): number | null {
  if (valor == null || valor.trim() === '') return null
  const n = Number.parseInt(valor, 10)
  return Number.isFinite(n) ? n : null
}
