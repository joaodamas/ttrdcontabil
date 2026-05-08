import { useMemo } from 'react'
import { useFinanceiroSnapshotQuery } from './queries'
import type { FinanceiroListFilters, LancamentoRecord } from './types'

const PAGE_SIZE = 20

export function useFinanceiroList(
  filters: FinanceiroListFilters & { tipo: string; status: string; page: number }
) {
  const query = useFinanceiroSnapshotQuery({ ...filters, pageSize: PAGE_SIZE })

  const filteredLancamentos = useMemo(() => {
    const all = (query.data?.allLancamentos ?? []) as LancamentoRecord[]
    return all.filter((l) => {
      if (filters.tipo && l.tipo !== filters.tipo) return false
      if (filters.status && l.status !== filters.status) return false
      return true
    })
  }, [query.data?.allLancamentos, filters.tipo, filters.status])

  const total = filteredLancamentos.length
  const totalPages = query.data?.hasMore ? filters.page + 1 : filters.page
  const lancamentos = filteredLancamentos

  return {
    ...query,
    lancamentos,
    filteredLancamentos,
    total,
    totalPages,
    hasMore: query.data?.hasMore ?? false,
    lastCursor: query.data?.lastCursor ?? null,
    somaAReceber: query.data?.somaAReceber ?? 0,
    somaRecebidoMes: query.data?.somaRecebidoMes ?? 0,
    somaEmAtraso: query.data?.somaEmAtraso ?? 0,
  }
}
