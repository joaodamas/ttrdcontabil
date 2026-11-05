import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchContratosRecorrentes } from './services'

const base = createFeatureKeys('nfse-recorrentes')

export const nfseRecorrentesKeys = {
  all: base.all,
  doCliente: (clienteId: string) => [...base.list('cliente'), clienteId] as const,
}

export function useContratosRecorrentesQuery(clienteId: string) {
  return useQuery({
    queryKey: nfseRecorrentesKeys.doCliente(clienteId),
    queryFn: () => fetchContratosRecorrentes(clienteId),
    enabled: !!clienteId,
    staleTime: queryStaleTimes.fiscal,
  })
}

/** Invalida os contratos depois de gravar (criar, editar, suspender). */
export function useInvalidateContratosRecorrentes() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: nfseRecorrentesKeys.all })
}
