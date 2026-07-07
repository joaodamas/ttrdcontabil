import type { Timestamp } from 'firebase/firestore'

export type NotaFiscalRecord = Record<string, unknown> & {
  id: string
  clienteNome?: string
  numeroNfse?: string
  dataEmissao?: Timestamp
  valorServico?: number
  status?: string
  _origem?: 'rascunho'
  origemEmissao?: 'automatica' | 'manual'
}

export type FiscalSnapshot = {
  emitidaMesCount: number
  somaEmitidaMes: number
  pendenteCount: number
  erroCount: number
  canceladaCount: number
  notas: NotaFiscalRecord[]
}

export type FiscalReadinessCliente = {
  clienteId: string
  clienteNome: string
  cpfCnpj?: string
  municipio?: string
  diaEmissaoNFSe?: number
  servicosAtivos: number
  bloqueios: string[]
  prontoRascunho: boolean
  prontoEmissao: boolean
  emissaoAutomatica: boolean
}

export type FiscalReadiness = {
  totalClientesAtivos: number
  prontosRascunho: number
  prontosEmissao: number
  bloqueados: number
  emissaoAutomaticaCount: number
  clientes: FiscalReadinessCliente[]
}
