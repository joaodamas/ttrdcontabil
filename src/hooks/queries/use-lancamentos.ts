'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLancamentos, createDocument, updateDocument, deleteDocument } from '@/lib/firestore-client'

export const lancamentoKeys = {
  all:  ['lancamentos'] as const,
  list: (opts?: { clienteId?: string; status?: string }) =>
    ['lancamentos', 'list', opts?.clienteId ?? '', opts?.status ?? ''] as const,
}

export function useLancamentos(opts: { clienteId?: string; status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: lancamentoKeys.list(opts),
    queryFn:  () => getLancamentos(opts),
  })
}

export function useCreateLancamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createDocument('lancamentos', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: lancamentoKeys.all }),
  })
}

export function useUpdateLancamento(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => updateDocument('lancamentos', id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: lancamentoKeys.all }),
  })
}

export function useDeleteLancamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDocument('lancamentos', id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: lancamentoKeys.all }),
  })
}
