/**
 * KPIs do Painel — regras puras (sem firebase, sem relógio implícito).
 *
 * Usado pelo callable `recalcularDashboardKpis` e pelo cron
 * `recalcularDashboardKpisAgendado` (functions/src/dashboard.ts) via
 * functions/src/dashboard-kpis.ts, e pelo vitest da raiz.
 *
 * Os KPIs ficam em DOIS documentos com o mesmo id (`<tenant>_<ano>_<mm>`):
 *  - `dashboard_kpis`            — operacionais, legível por qualquer perfil ativo;
 *  - `dashboard_kpis_financeiro` — somas/contagens de recebíveis, legível só por
 *    quem lê `lancamentos` (canReadFinanceiro() em firestore.rules).
 * Antes tudo ia para `dashboard_kpis`, e operacional/fiscal/leitura — que não
 * leem `lancamentos` — viam quanto o escritório tem a receber e em atraso.
 */

export const COLECAO_KPIS = 'dashboard_kpis'
export const COLECAO_KPIS_FINANCEIRO = 'dashboard_kpis_financeiro'

/** Fuso do escritório. Brasil sem horário de verão desde 2019: UTC−3 fixo. */
export const FUSO_ESCRITORIO = 'America/Sao_Paulo'
const OFFSET_SP_HORAS = 3

export function idDocKpis(tenantId: string, ano: number, mes: number): string {
  return `${tenantId}_${ano}_${String(mes).padStart(2, '0')}`
}

/** Dia/mês/ano civis em São Paulo (a function roda em UTC). */
export function dataCivilSaoPaulo(agora: Date): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_ESCRITORIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora)
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value)
  return { ano: valor('year'), mes: valor('month'), dia: valor('day') }
}

/**
 * Janela de vencimento usada nos KPIs financeiros: início do dia de hoje e fim
 * do 7º dia à frente, ambos no horário de São Paulo. Antes era calculado com o
 * relógio local da function (UTC): entre 21h e 0h de Brasília o "hoje" já era
 * o dia seguinte e um título vencido naquela tarde não contava como atrasado.
 */
export function janelaVencimento(agora: Date): { inicioHoje: Date; fimEm7Dias: Date } {
  const { ano, mes, dia } = dataCivilSaoPaulo(agora)
  const inicioHoje = new Date(Date.UTC(ano, mes - 1, dia, OFFSET_SP_HORAS, 0, 0, 0))
  const fimEm7Dias = new Date(Date.UTC(ano, mes - 1, dia + 8, OFFSET_SP_HORAS, 0, 0, 0) - 1)
  return { inicioHoje, fimEm7Dias }
}

export class ErroEntradaKpis extends Error {}

/** Mês/ano pedidos (padrão: mês corrente em São Paulo). */
export function validarMesAno(data: unknown, agora: Date): { mes: number; ano: number } {
  const atual = dataCivilSaoPaulo(agora)
  const input = (data ?? {}) as { mes?: unknown; ano?: unknown }
  const mes = Number(input.mes ?? atual.mes)
  const ano = Number(input.ano ?? atual.ano)
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new ErroEntradaKpis('Mês inválido para KPIs do dashboard.')
  }
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    throw new ErroEntradaKpis('Ano inválido para KPIs do dashboard.')
  }
  return { mes, ano }
}

export type KpisOperacionais = {
  totalClientesAtivos: number
  compCounts: Record<string, number>
  tarefasPendentes: number
}

export type KpisFinanceiros = {
  somaVencendo: number
  vencendoCount: number
  somaAtrasados: number
  atrasadosCount: number
}

export function contarPorStatus(statuses: Array<unknown>): Record<string, number> {
  const contagem: Record<string, number> = {}
  for (const status of statuses) {
    if (typeof status === 'string' && status) contagem[status] = (contagem[status] ?? 0) + 1
  }
  return contagem
}

export function somarValores(valores: Array<unknown>): number {
  return valores.reduce<number>(
    (acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
    0,
  )
}

/** Campos financeiros — o teste garante que nenhum cai em `dashboard_kpis`. */
export const CAMPOS_KPIS_FINANCEIROS = ['somaVencendo', 'vencendoCount', 'somaAtrasados', 'atrasadosCount'] as const

export type MetaKpis = {
  tenantId: string
  mes: number
  ano: number
  atualizadoPorId: string
  atualizadoPorNome: string
  origem: 'cloud_function' | 'scheduler'
}

/**
 * Monta os dois documentos. `atualizadoEm` (hora do servidor) é acrescentado
 * por quem grava. Os docs são gravados SEM merge: o set substitui o doc
 * inteiro, e é isso que apaga as somas financeiras que ficaram no
 * `dashboard_kpis` antigo.
 */
export function montarDocsKpis(meta: MetaKpis, op: KpisOperacionais, fin: KpisFinanceiros) {
  return {
    operacional: { ...meta, ...op },
    financeiro: { ...meta, ...fin },
  }
}
