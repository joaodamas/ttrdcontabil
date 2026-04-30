import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchFechamentos } from './services'
import type { FechamentoFilters } from './types'

const base = createFeatureKeys('fechamento')

export const fechamentoKeys = {
  all: base.all,
  list: (filters: FechamentoFilters) =>
    [...base.list('list'), filters.mes, filters.ano, filters.regime || 'todos-regimes'] as const,
}

export function useFechamentosQuery(filters: FechamentoFilters) {
  return useQuery({
    queryKey: fechamentoKeys.list(filters),
    queryFn: () => fetchFechamentos(filters),
  })
}
