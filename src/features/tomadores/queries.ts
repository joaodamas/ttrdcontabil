import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchPrestador, fetchTomadores } from './services'

const base = createFeatureKeys('tomadores')

export const tomadoresKeys = {
  all: base.all,
  doCliente: (clienteId: string) => [...base.list('cliente'), clienteId] as const,
  prestador: (clienteId: string) => [...base.all, 'prestador', clienteId] as const,
}

export function useTomadoresQuery(clienteId: string) {
  return useQuery({
    queryKey: tomadoresKeys.doCliente(clienteId),
    queryFn: () => fetchTomadores(clienteId),
    enabled: !!clienteId,
    // Cadastro, não operação: muda pouco e é lido a cada abertura do formulário
    // de contrato.
    staleTime: queryStaleTimes.reference,
  })
}

export function usePrestadorQuery(clienteId: string) {
  return useQuery({
    queryKey: tomadoresKeys.prestador(clienteId),
    queryFn: () => fetchPrestador(clienteId),
    enabled: !!clienteId,
    staleTime: queryStaleTimes.reference,
  })
}

/** Invalida a carteira depois de gravar (criar, editar, inativar, importar). */
export function useInvalidateTomadores() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: tomadoresKeys.all })
}
