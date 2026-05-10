import type { Timestamp } from 'firebase/firestore'

export type HojeTask = {
  id: string
  titulo?: string
  clienteNome?: string
  competenciaId?: string
  prioridade?: string
  responsavelId?: string
  responsavelNome?: string
  dataPrazo?: Timestamp
  status?: string
  tipo?: string
  area?: string
  impactoFinanceiro?: boolean
  valorEnvolvido?: number
}

export type HojeUsuario = {
  id: string
  nome?: string
  perfil?: string
}

export type HojeCockpitData = {
  atrasadas: HojeTask[]
  hoje: HojeTask[]
  proximos7Dias: HojeTask[]
  bloqueiosFechamento: Array<{ id: string; clienteNome?: string }>
}
