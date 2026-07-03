type FirestoreTimestampLike = { toDate: () => Date }

function isFirestoreTimestampLike(value: unknown): value is FirestoreTimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as FirestoreTimestampLike).toDate === 'function'
  )
}

/**
 * Normaliza um valor de data vindo do Firestore (Timestamp, Date ou string)
 * para o formato aceito por <input type="date"> (YYYY-MM-DD).
 * Retorna string vazia se o valor for vazio/inválido, para não quebrar o
 * schema Zod (z.string()) nem deixar o input com Timestamp cru.
 */
export function toDateInputValue(value: unknown): string {
  if (!value) return ''

  // já está no formato do input (ou é um ISO datetime): usa os 10 primeiros
  // caracteres direto, sem passar por `new Date()`, para não sofrer o
  // deslocamento de fuso horário que ocorreria ao reconverter para local.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }

  let d: Date | null = null
  if (isFirestoreTimestampLike(value)) {
    d = value.toDate()
  } else if (value instanceof Date) {
    d = value
  } else if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) d = parsed
  }

  if (!d || isNaN(d.getTime())) return ''

  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
