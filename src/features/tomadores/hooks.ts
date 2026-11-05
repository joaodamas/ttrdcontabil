import { useMemo } from 'react'
import type { TomadorRecord } from './types'
import { useTomadoresQuery, usePrestadorQuery } from './queries'
import { somenteDigitos } from './validacao'

/** Busca por nome OU documento: o contador tem o CNPJ na mão tanto quanto o nome. */
export function filtrarTomadores(tomadores: TomadorRecord[], busca: string): TomadorRecord[] {
  const termo = busca.trim().toLowerCase()
  if (!termo) return tomadores
  const documento = somenteDigitos(busca)

  return tomadores.filter(
    (t) =>
      String(t.razaoSocial ?? '').toLowerCase().includes(termo) ||
      (documento !== '' && String(t.cpfCnpj ?? '').includes(documento))
  )
}

export function useCarteiraTomadores(params: {
  clienteId: string
  busca?: string
  incluirInativos?: boolean
}) {
  const query = useTomadoresQuery(params.clienteId)
  const todos = useMemo(() => query.data?.tomadores ?? [], [query.data])

  const visiveis = useMemo(() => {
    const base = params.incluirInativos ? todos : todos.filter((t) => t.ativo !== false)
    return filtrarTomadores(base, params.busca ?? '')
  }, [todos, params.incluirInativos, params.busca])

  return {
    ...query,
    todos,
    visiveis,
    ativos: useMemo(() => todos.filter((t) => t.ativo !== false), [todos]),
    truncado: query.data?.truncado ?? false,
  }
}

/** Prestador da carteira — dono dos tomadores e lado "de quem sai" da nota. */
export function usePrestador(clienteId: string) {
  return usePrestadorQuery(clienteId)
}
