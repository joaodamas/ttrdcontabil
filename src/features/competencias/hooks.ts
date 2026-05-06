import { useMemo } from 'react'
import { useCompetenciasListQuery } from './queries'
import type { CompetenciaRecord, CompetenciasFilters } from './types'

const PAGE_SIZE = 20

export function useCompetenciasList(filters: CompetenciasFilters) {
  const query = useCompetenciasListQuery({ ...filters, pageSize: PAGE_SIZE })
  const rows = useMemo(() => (query.data ?? []) as CompetenciaRecord[], [query.data])
  const hasMore = rows.length > filters.page * PAGE_SIZE
  const total = Math.min(rows.length, filters.page * PAGE_SIZE)
  const totalPages = hasMore
    ? filters.page + 1
    : Math.max(1, Math.ceil(total / PAGE_SIZE))

  const competencias = useMemo(
    () => rows.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE),
    [rows, filters.page]
  )

  return {
    ...query,
    competencias,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
  }
}
