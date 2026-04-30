import { useMemo } from 'react'
import { useTarefasListQuery } from './queries'
import type { TarefaRecord, TarefasFilters } from './types'

const PAGE_SIZE = 20

export function useTarefasList(filters: TarefasFilters) {
  const query = useTarefasListQuery(filters)

  const total = (query.data ?? []).length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const tarefas = useMemo(
    () => ((query.data ?? []) as TarefaRecord[]).slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE),
    [query.data, filters.page]
  )

  return {
    ...query,
    tarefas,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
  }
}
