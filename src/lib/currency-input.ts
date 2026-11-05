/**
 * Helpers do CurrencyInput: conversão entre texto pt-BR ("1.234,56") e número.
 * Sem dependência de React para poder ser testado isoladamente.
 */

const formatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formata um número no padrão pt-BR com 2 casas ("1.234,56"). Vazio para null/NaN. */
export function formatBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return formatter.format(value)
}

/**
 * Converte o texto digitado em número.
 * - Com vírgula: vírgula é o decimal e pontos são separadores de milhar.
 * - Sem vírgula: um único ponto seguido de 1–2 dígitos é tratado como decimal
 *   (teclados numéricos); os demais pontos são milhar.
 * Retorna null para texto vazio ou inválido.
 */
export function parseBRL(text: string | null | undefined): number | null {
  if (text == null) return null
  let t = String(text).replace(/[R$\s ]/g, '')
  if (t === '') return null
  const negativo = t.startsWith('-')
  t = t.replace(/-/g, '')

  let normalizado: string
  if (t.includes(',')) {
    normalizado = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d*\.\d{1,2}$/.test(t)) {
    normalizado = t
  } else {
    normalizado = t.replace(/\./g, '')
  }

  if (!/^\d*\.?\d*$/.test(normalizado) || normalizado === '' || normalizado === '.') return null
  const n = Number(normalizado)
  if (!Number.isFinite(n)) return null
  const arredondado = Math.round(n * 100) / 100
  return negativo ? -arredondado : arredondado
}

/**
 * Limpa o texto durante a digitação: mantém só dígitos, pontos e uma vírgula,
 * com no máximo 2 casas decimais após a vírgula.
 */
export function sanitizeBRLInput(text: string): string {
  let t = text.replace(/[^\d.,]/g, '')
  const idx = t.indexOf(',')
  if (idx >= 0) {
    const inteiro = t.slice(0, idx)
    const decimais = t.slice(idx + 1).replace(/[.,]/g, '').slice(0, 2)
    t = `${inteiro},${decimais}`
  }
  return t
}
