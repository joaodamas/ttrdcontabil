import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchCompetencias } from './services'
import type { CompetenciasFilters } from './types'

const base = createFeatureKeys('competencias')

export const competenciasKeys = {
  all: base.all,
  list: (filters: CompetenciasFilters) =>
    [
      ...base.list('list'),
      filters.mes,
      filters.ano,
      filters.status || 'todos',
      filters.clienteId || 'todos-clientes',
    ] as const,
}

export function useCompetenciasListQuery(filters: CompetenciasFilters) {
  return useQuery({
    queryKey: competenciasKeys.list(filters),
    queryFn: () => fetchCompetencias(filters),
  })
}
