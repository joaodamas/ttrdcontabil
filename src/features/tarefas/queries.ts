import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchTarefas } from './services'
import type { TarefasFilters } from './types'

const base = createFeatureKeys('tarefas')

export const tarefasKeys = {
  all: base.all,
  list: (filters: TarefasFilters) =>
    [
      ...base.list('list'),
      filters.status || 'todos',
      filters.prioridade || 'qualquer',
      filters.responsavelId || 'sem-responsavel',
      filters.clienteId || 'sem-cliente',
      filters.competenciaId || 'sem-competencia',
    ] as const,
}

export function useTarefasListQuery(filters: TarefasFilters) {
  return useQuery({
    queryKey: tarefasKeys.list(filters),
    queryFn: () => fetchTarefas(filters),
  })
}
