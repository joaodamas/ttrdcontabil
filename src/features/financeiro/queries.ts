import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchFinanceiroAgregados, fetchFinanceiroSnapshot } from './services'
import type { FinanceiroAgregadosFilters, FinanceiroListFilters } from './types'

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
  // Sem página nem cursor na chave: trocar de página não pode refazer (nem
  // invalidar) os agregados, que são os mesmos para todas as páginas do filtro.
  agregados: (filters: FinanceiroAgregadosFilters) =>
    [
      ...base.list('agregados'),
      filters.clienteId || 'todos-clientes',
      filters.competenciaId || 'todas-competencias',
      filters.tipo || 'todos-tipos',
      filters.status || 'todos-status',
    ] as const,
}

export function useFinanceiroSnapshotQuery(filters: FinanceiroListFilters) {
  return useQuery({
    queryKey: financeiroKeys.snapshot(filters),
    queryFn: () => fetchFinanceiroSnapshot(filters),
    staleTime: queryStaleTimes.financial,
  })
}

/**
 * Query separada da tabela de propósito: a tabela precisa ser rápida e mostrar
 * 20 linhas; os agregados precisam varrer a base inteira e podem demorar. Juntas
 * numa query só, ou a tabela espera a varredura, ou os agregados herdam o limite
 * da página — que era exatamente o defeito.
 */
export function useFinanceiroAgregadosQuery(filters: FinanceiroAgregadosFilters) {
  return useQuery({
    queryKey: financeiroKeys.agregados(filters),
    queryFn: () => fetchFinanceiroAgregados(filters),
    staleTime: queryStaleTimes.financial,
  })
}
