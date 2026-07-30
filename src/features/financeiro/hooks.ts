import { useMemo } from 'react'
import { useFinanceiroSnapshotQuery } from './queries'
import type { FinanceiroListFilters, LancamentoRecord } from './types'

const PAGE_SIZE = 20

/**
 * 'atrasado' nunca é gravado em `status`: é derivado de pendente + vencido, e
 * o service já traduz o filtro na própria query para
 * (status == 'pendente' && dataVencimento < hoje).
 *
 * Armadilha: o refiltro em memória comparava `l.status !== filters.status`
 * direto. As linhas voltam como 'pendente', 'pendente' !== 'atrasado', e a
 * tabela zerava — o caminho do Painel para a inadimplência morria aqui.
 * Então para 'atrasado' conferimos só a parte que é dado (pendente); a parte
 * que é relógio fica com o service, que é quem tem o `hoje` da consulta.
 */
function correspondeAoStatus(lancamento: LancamentoRecord, status: string): boolean {
  if (status === 'atrasado') return lancamento.status === 'pendente'
  return lancamento.status === status
}

export function useFinanceiroList(
  filters: FinanceiroListFilters & { tipo: string; status: string; page: number }
) {
  const query = useFinanceiroSnapshotQuery({ ...filters, pageSize: PAGE_SIZE })

  const filteredLancamentos = useMemo(() => {
    const all = (query.data?.allLancamentos ?? []) as LancamentoRecord[]
    return all.filter((l) => {
      if (filters.tipo && l.tipo !== filters.tipo) return false
      if (filters.status && !correspondeAoStatus(l, filters.status)) return false
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
