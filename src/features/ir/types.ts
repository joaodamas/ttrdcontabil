import type { Timestamp } from 'firebase/firestore'

export type IrDeclaracaoRecord = Record<string, unknown> & {
  id: string
  clienteNome?: string
  anoBase?: number
  status?: string
  responsavelNome?: string
  dataEntrega?: Timestamp
}

export type IrFilters = {
  anoBase: number
  status: string
  page: number
}
