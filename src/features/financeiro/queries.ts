import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchFinanceiroSnapshot } from './services'
import type { FinanceiroBaseFilters } from './types'

const base = createFeatureKeys('financeiro')

export const financeiroKeys = {
  all: base.all,
  snapshot: (filters: FinanceiroBaseFilters) =>
    [...base.list('snapshot'), filters.clienteId || 'todos-clientes', filters.competenciaId || 'todas-competencias'] as const,
}

export function useFinanceiroSnapshotQuery(filters: FinanceiroBaseFilters) {
  return useQuery({
    queryKey: financeiroKeys.snapshot(filters),
    queryFn: () => fetchFinanceiroSnapshot(filters),
  })
}
