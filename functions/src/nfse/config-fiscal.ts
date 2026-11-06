/**
 * Uma configuração fiscal por cliente — regras PURAS (sem firebase-admin).
 *
 * Desde 2026-11-06 o documento de `clientes_fiscal` tem id = clienteId (o
 * formulário cria assim e as firestore.rules recusam outro id). Documentos
 * antigos têm auto-id e um cliente pode ter mais de um; as functions liam com
 * `where(clienteId).limit(1)`, que devolve QUALQUER um deles (não é
 * determinístico). A leitura tolerante abaixo: o doc de id = clienteId vence;
 * sem ele, o mais recente por `atualizadoEm` (depois `criadoEm`, depois id).
 * `scripts/unificar-config-fiscal.mjs` migra os antigos.
 */

export interface DocConfigFiscal {
  id: string
  data: Record<string, unknown>
}

function millis(v: unknown): number {
  if (v && typeof v === 'object') {
    const t = v as { toMillis?: () => number; seconds?: number; _seconds?: number }
    if (typeof t.toMillis === 'function') return t.toMillis()
    if (typeof t.seconds === 'number') return t.seconds * 1000
    if (typeof t._seconds === 'number') return t._seconds * 1000
  }
  if (typeof v === 'string') {
    const n = Date.parse(v)
    return Number.isFinite(n) ? n : 0
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Mais recente primeiro: atualizadoEm, criadoEm e, no empate, o id (estável). */
export function compararConfigFiscalMaisRecente(a: DocConfigFiscal, b: DocConfigFiscal): number {
  return (millis(b.data.atualizadoEm) - millis(a.data.atualizadoEm))
    || (millis(b.data.criadoEm) - millis(a.data.criadoEm))
    || a.id.localeCompare(b.id)
}

/**
 * Escolhe a configuração fiscal de `clienteId` entre os documentos dados
 * (só valem os que têm o mesmo clienteId no corpo).
 */
export function escolherDocConfigFiscal<T extends DocConfigFiscal>(clienteId: string, docs: readonly T[]): T | null {
  const doCliente = docs.filter((d) => d.data.clienteId === clienteId)
  if (doCliente.length === 0) return null
  const canonico = doCliente.find((d) => d.id === clienteId)
  if (canonico) return canonico
  return [...doCliente].sort(compararConfigFiscalMaisRecente)[0]
}
