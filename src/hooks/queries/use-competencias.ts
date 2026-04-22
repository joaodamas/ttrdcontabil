'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCompetencias, createDocument, updateDocument } from '@/lib/firestore-client'

export const competenciaKeys = {
  all:    ['competencias'] as const,
  list:   (clienteId?: string) => ['competencias', 'list', clienteId ?? 'todos'] as const,
  detail: (id: string)         => ['competencias', 'detail', id] as const,
}

export function useCompetencias(opts: { clienteId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: competenciaKeys.list(opts.clienteId),
    queryFn:  () => getCompetencias(opts),
  })
}

export function useCreateCompetencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createDocument('competencias', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: competenciaKeys.all }),
  })
}

export function useUpdateCompetencia(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => updateDocument('competencias', id, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: competenciaKeys.all })
      qc.invalidateQueries({ queryKey: competenciaKeys.detail(id) })
    },
  })
}
