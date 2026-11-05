/**
 * Definição única de "pendência" no fechamento mensal.
 *
 * Cada cliente tem 4 obrigações (DAS, eSocial, Reinf, FGTS). Cada uma cai
 * em exatamente uma situação:
 * - concluída     → enviado, ok, sm (sem movimento)
 * - em aberto     → pendente, parcial, guia (guia emitida, falta confirmar)
 * - não se aplica → na
 *
 * Um cliente "tem pendência" quando pelo menos uma obrigação está em aberto.
 * Banner, KPIs, lista de pendências e diálogo de encerramento usam todos
 * esta mesma regra — antes cada um contava de um jeito.
 */

export type StatusObrigacaoFechamento = 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'

export type SituacaoObrigacao = 'concluida' | 'em_aberto' | 'nao_se_aplica'

export const CAMPOS_OBRIGACAO = ['dasStatus', 'esocialStatus', 'reinfStatus', 'fgtsStatus'] as const

export type CampoObrigacao = (typeof CAMPOS_OBRIGACAO)[number]

export type FechamentoStatusRow = Partial<Record<CampoObrigacao, string | null | undefined>>

const CONCLUIDA = new Set(['enviado', 'ok', 'sm'])
const NAO_SE_APLICA = new Set(['na'])

/** Status desconhecido ou ausente conta como em aberto: melhor cobrar do que esconder. */
export function situacaoObrigacao(status: string | null | undefined): SituacaoObrigacao {
  if (status && CONCLUIDA.has(status)) return 'concluida'
  if (status && NAO_SE_APLICA.has(status)) return 'nao_se_aplica'
  return 'em_aberto'
}

export function obrigacoesEmAberto(row: FechamentoStatusRow): number {
  return CAMPOS_OBRIGACAO.filter((campo) => situacaoObrigacao(row[campo]) === 'em_aberto').length
}

export function temPendencia(row: FechamentoStatusRow): boolean {
  return obrigacoesEmAberto(row) > 0
}

export interface ResumoFechamento {
  /** Clientes no mês (linhas de fechamento). */
  totalClientes: number
  /** Clientes sem nenhuma obrigação em aberto. */
  clientesEmDia: number
  /** Clientes com ao menos uma obrigação em aberto. emDia + comPendencia = total. */
  clientesComPendencia: number
  /** Obrigações que se aplicam (exclui "não se aplica"). */
  obrigacoesAplicaveis: number
  obrigacoesConcluidas: number
  /** Obrigações pendentes, parciais ou com guia. concluídas + em aberto = aplicáveis. */
  obrigacoesEmAberto: number
  /** % de obrigações aplicáveis concluídas (0–100, arredondado; 100 se nada se aplica). */
  pctConcluido: number
  /** Contagem só do DAS — mantida para o snapshot de auditoria da revisão. */
  das: { enviados: number; pendentes: number; parciais: number }
}

export function resumirFechamentos(rows: FechamentoStatusRow[]): ResumoFechamento {
  let clientesComPendencia = 0
  let obrigacoesAplicaveis = 0
  let obrigacoesConcluidas = 0
  let emAberto = 0
  const das = { enviados: 0, pendentes: 0, parciais: 0 }

  for (const row of rows) {
    let abertasDoCliente = 0
    for (const campo of CAMPOS_OBRIGACAO) {
      const situacao = situacaoObrigacao(row[campo])
      if (situacao === 'nao_se_aplica') continue
      obrigacoesAplicaveis++
      if (situacao === 'concluida') obrigacoesConcluidas++
      else abertasDoCliente++
    }
    emAberto += abertasDoCliente
    if (abertasDoCliente > 0) clientesComPendencia++

    if (row.dasStatus && CONCLUIDA.has(row.dasStatus)) das.enviados++
    else if (row.dasStatus === 'pendente') das.pendentes++
    else if (row.dasStatus === 'parcial') das.parciais++
  }

  const totalClientes = rows.length
  return {
    totalClientes,
    clientesEmDia: totalClientes - clientesComPendencia,
    clientesComPendencia,
    obrigacoesAplicaveis,
    obrigacoesConcluidas,
    obrigacoesEmAberto: emAberto,
    pctConcluido: obrigacoesAplicaveis > 0
      ? Math.round((obrigacoesConcluidas / obrigacoesAplicaveis) * 100)
      : totalClientes > 0 ? 100 : 0,
    das,
  }
}
