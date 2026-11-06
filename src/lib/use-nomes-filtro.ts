'use client'

import { useQuery } from '@tanstack/react-query'

import { getDocument, getUsuarios } from '@/lib/firestore-client'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { formatMesAno } from '@/lib/utils'

/*
 * Nomes legíveis para os chips de filtro (FiltrosAtivos): a URL carrega o id
 * (clienteId, responsavelId, competenciaId), o chip mostra o nome. Enquanto
 * carrega — ou se a leitura falhar — usa o `fallback` (ex.: o nome que já veio
 * nas linhas da lista) e, por último, "…".
 */

export function useNomeCliente(clienteId: string | null | undefined, fallback?: string): string {
  const q = useQuery({
    queryKey: ['nome-filtro', 'cliente', clienteId],
    queryFn: async () => {
      const c = await getDocument<{ razaoSocial?: string; nomeFantasia?: string }>('clientes', clienteId!)
      return c ? (c.razaoSocial || c.nomeFantasia || null) : null
    },
    enabled: !!clienteId,
    staleTime: queryStaleTimes.reference,
  })
  return q.data || fallback || (q.isLoading ? '…' : 'Cliente não encontrado')
}

export function useNomeResponsavel(responsavelId: string | null | undefined, fallback?: string): string {
  const q = useQuery({
    queryKey: ['nome-filtro', 'responsavel', responsavelId],
    queryFn: async () => {
      const usuarios = await getUsuarios()
      const u = usuarios.find((x) => x.id === responsavelId)
      return (u?.nome as string | undefined) ?? null
    },
    enabled: !!responsavelId,
    staleTime: queryStaleTimes.reference,
  })
  return q.data || fallback || (q.isLoading ? '…' : 'Usuário')
}

export function useRotuloCompetencia(competenciaId: string | null | undefined, fallback?: string): string {
  const q = useQuery({
    queryKey: ['nome-filtro', 'competencia', competenciaId],
    queryFn: async () => {
      const c = await getDocument<{ clienteNome?: string; mes?: number; ano?: number; servicoNome?: string }>('competencias', competenciaId!)
      if (!c) return null
      const periodo = c.mes && c.ano ? formatMesAno(c.mes, c.ano) : ''
      return [c.clienteNome, periodo].filter(Boolean).join(' — ') || null
    },
    enabled: !!competenciaId,
    staleTime: queryStaleTimes.reference,
  })
  return q.data || fallback || (q.isLoading ? '…' : 'Competência')
}
