'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTarefas, createDocument, updateDocument, deleteDocument } from '@/lib/firestore-client'

export const tarefaKeys = {
  all:  ['tarefas'] as const,
  list: (opts?: { responsavelId?: string; status?: string }) =>
    ['tarefas', 'list', opts?.responsavelId ?? '', opts?.status ?? ''] as const,
  detail: (id: string) => ['tarefas', 'detail', id] as const,
}

export function useTarefas(opts: { responsavelId?: string; status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: tarefaKeys.list(opts),
    queryFn:  () => getTarefas(opts),
    staleTime: 60 * 1000, // 1 min — tarefas mudam com mais frequência
  })
}

export function useCreateTarefa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createDocument('tarefas', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tarefaKeys.all }),
  })
}

export function useUpdateTarefa(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => updateDocument('tarefas', id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tarefaKeys.all }),
  })
}

export function useDeleteTarefa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDocument('tarefas', id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tarefaKeys.all }),
  })
}
