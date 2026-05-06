import { useMemo } from 'react'
import { useTarefasListQuery } from './queries'
import type { TarefaRecord, TarefasFilters } from './types'

const PAGE_SIZE = 20

export function useTarefasList(filters: TarefasFilters) {
  const query = useTarefasListQuery({ ...filters, pageSize: PAGE_SIZE })

  const rows = useMemo(() => (query.data ?? []) as TarefaRecord[], [query.data])
  const hasMore = rows.length > filters.page * PAGE_SIZE
  const total = Math.min(rows.length, filters.page * PAGE_SIZE)
  const totalPages = hasMore
    ? filters.page + 1
    : Math.max(1, Math.ceil(total / PAGE_SIZE))
  const tarefas = useMemo(
    () => rows.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE),
    [rows, filters.page]
  )

  return {
    ...query,
    tarefas,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
  }
}
