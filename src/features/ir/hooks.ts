import { useMemo } from 'react'
import { useIrListQuery } from './queries'
import type { IrDeclaracaoRecord, IrFilters } from './types'

const PAGE_SIZE = 20

export function useIrList(filters: IrFilters) {
  const query = useIrListQuery(filters)
  const total = (query.data ?? []).length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const declaracoes = useMemo(
    () => ((query.data ?? []) as IrDeclaracaoRecord[]).slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE),
    [query.data, filters.page]
  )
  return {
    ...query,
    declaracoes,
    total,
    totalPages,
  }
}
