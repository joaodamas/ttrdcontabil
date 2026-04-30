export type CompetenciaRecord = Record<string, unknown> & {
  id: string
  mes?: number
  ano?: number
  status?: string
  clienteId?: string
  clienteNome?: string
  servicoNome?: string
  responsavelNome?: string
}

export type CompetenciasFilters = {
  mes: number
  ano: number
  status: string
  clienteId: string
  page: number
}
