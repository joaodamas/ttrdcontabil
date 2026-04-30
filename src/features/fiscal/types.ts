import type { Timestamp } from 'firebase/firestore'

export type NotaFiscalRecord = Record<string, unknown> & {
  id: string
  clienteNome?: string
  numeroNfse?: string
  dataEmissao?: Timestamp
  valorServico?: number
  status?: string
  _origem?: 'rascunho'
}

export type FiscalSnapshot = {
  emitidaMesCount: number
  somaEmitidaMes: number
  pendenteCount: number
  erroCount: number
  canceladaCount: number
  notas: NotaFiscalRecord[]
}
