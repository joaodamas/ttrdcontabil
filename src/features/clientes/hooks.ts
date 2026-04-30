import { useMemo } from 'react'
import type { ClienteRecord } from './types'
import { useClientesListQuery } from './queries'

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
  const query = useClientesListQuery(params.status || undefined)

  const filtered = useMemo(
    () => filterClientes((query.data ?? []) as ClienteRecord[], params.busca),
    [query.data, params.busca]
  )

  const total = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
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
