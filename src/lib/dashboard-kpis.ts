/**
 * KPIs do Painel no navegador: idade do documento e rótulo "atualizado há…".
 * Os docs são escritos pelo servidor (functions/src/dashboard.ts): o cron
 * recalcula de hora em hora no horário comercial e a tela recalcula pelo
 * callable quando o doc passa de KPIS_IDADE_MAXIMA_MS.
 */
export {
  COLECAO_KPIS,
  COLECAO_KPIS_FINANCEIRO,
  idDocKpis,
} from '../../functions/src/dashboard-kpis-regras'

export const KPIS_IDADE_MAXIMA_MS = 60 * 60 * 1000

type TimestampLike = { toDate: () => Date } | { seconds: number } | Date | string | number | null | undefined

/** Data de `atualizadoEm` vinda do Firestore (Timestamp) ou do callable (ISO). */
export function dataAtualizacaoKpis(valor: unknown): Date | null {
  const v = valor as TimestampLike
  if (v == null) return null
  let d: Date | null = null
  if (v instanceof Date) d = v
  else if (typeof v === 'string' || typeof v === 'number') d = new Date(v)
  else if (typeof v === 'object' && 'toDate' in v && typeof v.toDate === 'function') d = v.toDate()
  else if (typeof v === 'object' && 'seconds' in v && typeof v.seconds === 'number') d = new Date(v.seconds * 1000)
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** Sem data (doc antigo, sem `atualizadoEm`) conta como desatualizado. */
export function kpisDesatualizados(atualizadoEm: Date | null, agora: Date, idadeMaximaMs = KPIS_IDADE_MAXIMA_MS): boolean {
  if (!atualizadoEm) return true
  return agora.getTime() - atualizadoEm.getTime() > idadeMaximaMs
}

export function rotuloAtualizacaoKpis(atualizadoEm: Date | null, agora: Date): string {
  if (!atualizadoEm) return 'Atualização desconhecida'
  const minutos = Math.max(0, Math.floor((agora.getTime() - atualizadoEm.getTime()) / 60_000))
  if (minutos < 1) return 'Atualizado agora'
  if (minutos < 60) return `Atualizado há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Atualizado há ${horas} h`
  const dias = Math.floor(horas / 24)
  return `Atualizado há ${dias} dia${dias > 1 ? 's' : ''}`
}
