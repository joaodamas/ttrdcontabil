import type { Timestamp } from 'firebase/firestore'

export type TarefaRecord = Record<string, unknown> & {
  id: string
  titulo?: string
  descricao?: string
  status?: string
  prioridade?: string
  clienteId?: string
  clienteNome?: string
  competenciaId?: string
  responsavelId?: string
  responsavelNome?: string
  dataPrazo?: Timestamp
}

export type TarefasFilters = {
  status: string
  prioridade: string
  responsavelId: string
  clienteId: string
  competenciaId: string
  page: number
}
