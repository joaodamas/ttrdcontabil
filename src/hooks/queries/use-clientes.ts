'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getClientes,
  getCliente,
  createDocument,
  updateDocument,
  softDeleteDocument,
} from '@/lib/firestore-client'

// ── Query keys ────────────────────────────────────────────────────────────────
export const clienteKeys = {
  all:    ['clientes'] as const,
  list:   (status?: string) => ['clientes', 'list', status ?? 'todos'] as const,
  detail: (id: string)      => ['clientes', 'detail', id] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Lista de clientes com filtro opcional de status. */
export function useClientes(status?: string) {
  return useQuery({
    queryKey:  clienteKeys.list(status),
    queryFn:   () => getClientes(status ? { status } : {}),
    staleTime: 3 * 60 * 1000, // 3 min — clientes mudam pouco
  })
}

/** Detalhe de um único cliente. */
export function useCliente(id: string) {
  return useQuery({
    queryKey:  clienteKeys.detail(id),
    queryFn:   () => getCliente(id),
    enabled:   !!id,
  })
}

/** Cria um novo cliente e invalida o cache da lista. */
export function useCreateCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createDocument('clientes', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: clienteKeys.all }),
  })
}

/** Atualiza um cliente e invalida detalhe + lista. */
export function useUpdateCliente(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => updateDocument('clientes', id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: clienteKeys.all }),
  })
}

/** Soft-delete: marca deletedAt. */
export function useDeleteCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => softDeleteDocument('clientes', id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: clienteKeys.all }),
  })
}
