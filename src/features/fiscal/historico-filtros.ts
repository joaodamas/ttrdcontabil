import { getStatusLabel } from '@/lib/status-semantics'

/*
 * Filtros do Histórico de NFS-e (/fiscal/historico) usados também pelos KPIs
 * da tela Fiscal. `status` na URL aceita lista separada por vírgula, que vira
 * where('status', 'in', [...]) — mesmo índice do '=='.
 */

/** "Ver rejeições" e o KPI "Com erro": as duas situações que pedem correção. */
export const STATUS_COM_ERRO = 'rejeitada,erro_integracao'
/** KPI "Pendentes" (as notas; rascunhos não entram no histórico). */
export const STATUS_PENDENTES = 'pendente_processamento,cancelamento_pendente'

export function statusDaUrl(status: string | null | undefined): string[] {
  return (status ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10)
}

/** Rótulo legível do filtro de status. */
export function rotuloStatusFiltro(status: string): string {
  if (status === STATUS_COM_ERRO) return 'Com erro ou rejeição'
  if (status === STATUS_PENDENTES) return 'Pendentes'
  return statusDaUrl(status).map((s) => getStatusLabel('nfse', s)).join(' ou ')
}

/** Endereço do histórico filtrado (KPIs da tela Fiscal). */
export function hrefHistorico(filtros: { status?: string; mes?: number; ano?: number; clienteId?: string }): string {
  const p = new URLSearchParams()
  if (filtros.status) p.set('status', filtros.status)
  if (filtros.mes) p.set('mes', String(filtros.mes))
  if (filtros.ano) p.set('ano', String(filtros.ano))
  if (filtros.clienteId) p.set('clienteId', filtros.clienteId)
  const q = p.toString()
  return q ? `/fiscal/historico?${q}` : '/fiscal/historico'
}
