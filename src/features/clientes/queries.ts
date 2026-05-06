import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchClientes, fetchClienteDetail } from './services'

const base = createFeatureKeys('clientes')

export const clientesKeys = {
  all:    base.all,
  list:   (params: { status?: string; busca?: string; page?: number; pageSize?: number } = {}) =>
    [
      ...base.list('list'),
      params.status ?? 'todos',
      params.busca ?? '',
      params.page ?? 1,
      params.pageSize ?? 20,
    ] as const,
  detail: (id: string)      => [...base.all, 'detail', id] as const,
  fiscal: (id: string)      => [...base.all, 'fiscal', id] as const,
}

export function useClientesListQuery(params: { status?: string; busca?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: clientesKeys.list(params),
    queryFn:  () => fetchClientes(params),
    staleTime: queryStaleTimes.reference,
  })
}

export function useClienteDetailQuery(id: string) {
  return useQuery({
    queryKey: clientesKeys.detail(id),
    queryFn:  () => fetchClienteDetail(id),
    enabled:  !!id,
    staleTime: queryStaleTimes.operational,
  })
}
