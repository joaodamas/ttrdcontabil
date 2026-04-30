import type { Timestamp } from 'firebase/firestore'

export type LancamentoRecord = Record<string, unknown> & {
  id: string
  clienteId?: string
  clienteNome?: string
  competenciaId?: string
  tipo?: string
  status?: string
  descricao?: string
  valor?: number
  dataVencimento?: Timestamp
  dataPagamento?: Timestamp
}

export type FinanceiroBaseFilters = {
  clienteId: string
  competenciaId: string
}

export type FinanceiroSnapshot = {
  allLancamentos: LancamentoRecord[]
  somaAReceber: number
  somaRecebidoMes: number
  somaEmAtraso: number
}
