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

export type FinanceiroListFilters = FinanceiroBaseFilters & {
  tipo?: string
  status?: string
  page?: number
  pageSize?: number
}

export type FinanceiroSnapshot = {
  allLancamentos: LancamentoRecord[]
  hasMore: boolean
  somaAReceber: number
  somaRecebidoMes: number
  somaEmAtraso: number
}
