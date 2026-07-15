import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ClienteRecord } from './types'
import { useClientesListQuery, useClienteDetailQuery, useClientesRiscoQuery, clientesKeys } from './queries'

function filterClientes(clientes: ClienteRecord[], busca: string): ClienteRecord[] {
  if (!busca) return clientes
  const buscaLower = busca.toLowerCase()
  const documento = busca.replace(/\D/g, '')
  return clientes.filter(
    (c) =>
      String(c.razaoSocial ?? '').toLowerCase().includes(buscaLower) ||
      String(c.nomeFantasia ?? '').toLowerCase().includes(buscaLower) ||
      (documento !== '' && String(c.cpfCnpj ?? '').includes(documento))
  )
}

export function useClientesList(params: { busca: string; status: string }) {
  const status = params.status === 'all' ? '' : params.status
  const query = useClientesListQuery({ status: status || undefined })

  const filteredClientes = useMemo(
    () => filterClientes((query.data ?? []) as ClienteRecord[], params.busca),
    [query.data, params.busca]
  )

  return {
    ...query,
    allClientes: (query.data ?? []) as ClienteRecord[],
    filteredClientes,
    total: filteredClientes.length,
  }
}

/** Motivos de risco por cliente (cobrança vencida, tarefa atrasada) — mesmo critério
 *  usado no "Clientes em risco" do Painel. Retorna Map vazio em caso de erro. */
export function useClientesRisco() {
  const query = useClientesRiscoQuery()
  return query.data ?? new Map<string, string[]>()
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
