import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ClienteRecord } from './types'
import { useClientesListQuery, useClienteDetailQuery, clientesKeys } from './queries'

const PAGE_SIZE = 20

function filterClientes(clientes: ClienteRecord[], busca: string): ClienteRecord[] {
  if (!busca) return clientes
  const buscaLower = busca.toLowerCase()
  const documento = busca.replace(/\D/g, '')
  return clientes.filter(
    (c) =>
      String(c.razaoSocial ?? '').toLowerCase().includes(buscaLower) ||
      String(c.nomeFantasia ?? '').toLowerCase().includes(buscaLower) ||
      String(c.cpfCnpj ?? '').includes(documento)
  )
}

export function useClientesList(params: { busca: string; status: string; page: number }) {
  const status = params.status === 'all' ? '' : params.status
  const query = useClientesListQuery({
    status: status || undefined,
    busca: params.busca,
    page: params.page,
    pageSize: PAGE_SIZE,
  })

  const filtered = useMemo(
    () => filterClientes((query.data ?? []) as ClienteRecord[], params.busca),
    [query.data, params.busca]
  )

  const hasMore = !params.busca && filtered.length > params.page * PAGE_SIZE
  const total = params.busca ? filtered.length : Math.min(filtered.length, params.page * PAGE_SIZE)
  const totalPages = hasMore
    ? params.page + 1
    : Math.max(1, Math.ceil(total / PAGE_SIZE))
  const paginados = filtered.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE)

  return {
    ...query,
    allClientes: (query.data ?? []) as ClienteRecord[],
    filteredClientes: filtered,
    paginados,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
  }
}

/** Hook TanStack Query para dados completos do cliente 360°.
 *  Encapsula o Promise.all de clientes + servicos + competencias + lancamentos + fiscal.
 *  Pronto para uso — a página /clientes/[id] pode migrar para este hook gradualmente. */
export function useClienteDetail(id: string) {
  return useClienteDetailQuery(id)
}

/** Invalida todos os dados do cliente (após salvar fiscal, por exemplo). */
export function useInvalidateClienteDetail() {
  const qc = useQueryClient()
  return (id: string) => qc.invalidateQueries({ queryKey: clientesKeys.detail(id) })
}
