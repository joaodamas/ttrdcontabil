import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchIrDeclaracoes } from './services'
import type { IrFilters } from './types'

const base = createFeatureKeys('ir')

export const irKeys = {
  all: base.all,
  list: (filters: IrFilters) => [...base.list('list'), filters.anoBase, filters.status || 'todos'] as const,
}

export function useIrListQuery(filters: IrFilters) {
  return useQuery({
    queryKey: irKeys.list(filters),
    queryFn: () => fetchIrDeclaracoes(filters),
    staleTime: queryStaleTimes.operational,
  })
}
