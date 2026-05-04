import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchClientes, fetchClienteDetail } from './services'

const base = createFeatureKeys('clientes')

export const clientesKeys = {
  all:    base.all,
  list:   (status?: string) => [...base.list('list'), status ?? 'todos'] as const,
  detail: (id: string)      => [...base.all, 'detail', id] as const,
  fiscal: (id: string)      => [...base.all, 'fiscal', id] as const,
}

export function useClientesListQuery(status?: string) {
  return useQuery({
    queryKey: clientesKeys.list(status),
    queryFn:  () => fetchClientes(status),
  })
}

export function useClienteDetailQuery(id: string) {
  return useQuery({
    queryKey: clientesKeys.detail(id),
    queryFn:  () => fetchClienteDetail(id),
    enabled:  !!id,
    staleTime: 60_000,
  })
}
