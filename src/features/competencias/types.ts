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
  /** null = todos os meses (só com clienteId: histórico do cliente). */
  mes: number | null
  ano: number | null
  status: string
  clienteId: string
  page: number
  pageSize?: number
}
