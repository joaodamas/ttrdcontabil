import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchClientes } from './services'

const base = createFeatureKeys('clientes')

export const clientesKeys = {
  all: base.all,
  list: (status?: string) => [...base.list('list'), status ?? 'todos'] as const,
}

export function useClientesListQuery(status?: string) {
  return useQuery({
    queryKey: clientesKeys.list(status),
    queryFn: () => fetchClientes(status),
  })
}
