import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchFinanceiroSnapshot } from './services'
import type { FinanceiroListFilters } from './types'

const base = createFeatureKeys('financeiro')

export const financeiroKeys = {
  all: base.all,
  snapshot: (filters: FinanceiroListFilters) =>
    [
      ...base.list('snapshot'),
      filters.clienteId || 'todos-clientes',
      filters.competenciaId || 'todas-competencias',
      filters.tipo || 'todos-tipos',
      filters.status || 'todos-status',
      filters.page ?? 1,
      filters.pageSize ?? 20,
      filters.cursorKey ?? 'first-page',
    ] as const,
}

export function useFinanceiroSnapshotQuery(filters: FinanceiroListFilters) {
  return useQuery({
    queryKey: financeiroKeys.snapshot(filters),
    queryFn: () => fetchFinanceiroSnapshot(filters),
    staleTime: queryStaleTimes.financial,
  })
}
