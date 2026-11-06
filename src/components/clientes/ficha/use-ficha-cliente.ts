'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { where, orderBy, limit, type QueryConstraint } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { tsToDate } from '@/lib/utils'
import { ehPermissaoNegada } from '@/lib/error-message'
import { canAccessTela } from '@/lib/permissions'
import { useAuth } from '@/contexts/auth-context'

export type Registro = Record<string, unknown>

export type SecaoFicha =
  | 'servicos' | 'competencias' | 'tarefas' | 'lancamentos' | 'nfses'
  | 'rascunhos' | 'fiscal' | 'pop' | 'popNotas' | 'comentarios'

/** `negado` = as regras recusaram (perfil); `erro` = a leitura falhou. */
export type FalhaSecao = 'negado' | 'erro'

export interface DadosFicha {
  cliente: Registro | null
  servicos: Registro[]
  competencias: Registro[]
  tarefas: Registro[]
  lancamentos: Registro[]
  nfses: Registro[]
  rascunhos: Registro[]
  fiscal: Registro | null
  pop: Registro | null
  popNotas: Registro[]
  comentarios: Registro[]
  falhas: Partial<Record<SecaoFicha, FalhaSecao>>
  /** Falha ao ler o próprio cadastro (≠ cliente inexistente). */
  erroCliente: unknown
  naoEncontrado: boolean
}

const VAZIO: DadosFicha = {
  cliente: null, servicos: [], competencias: [], tarefas: [], lancamentos: [], nfses: [], rascunhos: [],
  fiscal: null, pop: null, popNotas: [], comentarios: [], falhas: {}, erroCliente: null, naoEncontrado: false,
}

/** O que o perfil vê na ficha — abas escondidas não leem nada. */
export function useAcessoFicha() {
  const { usuario } = useAuth()
  return useMemo(() => {
    const fiscal = canAccessTela(usuario, 'fiscal')
    return {
      competencias: canAccessTela(usuario, 'competencias'),
      tarefas: canAccessTela(usuario, 'tarefas'),
      financeiro: canAccessTela(usuario, 'financeiro'),
      fiscal,
      // As regras (canReadFiscalConfig, M1) negam clientes_fiscal ao perfil
      // financeiro mesmo com a tela 'fiscal': nem tenta ler.
      configFiscal: fiscal && usuario?.perfil !== 'financeiro',
    }
  }, [usuario])
}

/**
 * Tudo que a ficha mostra, numa carga só. Cada seção guarda a própria falha:
 * lista vazia por erro de leitura não pode aparecer como "nenhum registro", e
 * falta de permissão aparece como "Sem acesso a este módulo".
 * Recarregar (depois de salvar algo) mantém os dados na tela até a resposta —
 * sem voltar ao esqueleto, sem pulo de layout.
 */
export function useFichaCliente(clienteId: string) {
  const acesso = useAcessoFicha()
  const [dados, setDados] = useState<DadosFicha>(VAZIO)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(() => {
    if (!clienteId) return Promise.resolve()
    const falhas: Partial<Record<SecaoFicha, FalhaSecao>> = {}
    const lerOu = <T,>(secao: SecaoFicha, permitido: boolean, ler: () => Promise<T>, vazio: T): Promise<T> => {
      if (!permitido) return Promise.resolve(vazio)
      return ler().catch((err: unknown) => {
        falhas[secao] = ehPermissaoNegada(err) ? 'negado' : 'erro'
        return vazio
      })
    }
    const doCliente = where('clienteId', '==', clienteId)
    const lista = (col: string, ...resto: QueryConstraint[]) =>
      () => listDocuments<Registro>(col, [doCliente, ...resto]) as Promise<Registro[]>

    let erroCliente: unknown = null
    return Promise.all([
      getDocument('clientes', clienteId).catch((err: unknown) => { erroCliente = err ?? new Error('erro'); return null }),
      lerOu('servicos', true, lista('clientes_servicos', limit(50)), []),
      lerOu('competencias', acesso.competencias, lista('competencias', orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)), []),
      lerOu('tarefas', acesso.tarefas, lista('tarefas', limit(30)), []),
      lerOu('lancamentos', acesso.financeiro, lista('lancamentos', orderBy('dataVencimento', 'desc'), limit(20)), []),
      lerOu('nfses', acesso.fiscal, lista('nfse_emitidas', orderBy('criadoEm', 'desc'), limit(20)), []),
      lerOu('rascunhos', acesso.fiscal, lista('nfse_rascunhos', limit(20)), []),
      lerOu('fiscal', acesso.configFiscal, lista('clientes_fiscal', limit(1)), []),
      lerOu('pop', true, lista('clientes_pop', limit(1)), []),
      lerOu('popNotas', true, lista('clientes_pop_notas', orderBy('criadoEm', 'desc'), limit(50)), []),
      lerOu('comentarios', true, lista('clientes_comentarios', orderBy('criadoEm', 'desc'), limit(30)), []),
    ]).then(([cliente, servicos, competencias, tarefas, lancamentos, nfses, rascunhos, fiscal, pop, popNotas, comentarios]) => {
      if (acesso.fiscal && !acesso.configFiscal) falhas.fiscal = 'negado'
      setDados({
        cliente: (cliente as Registro | null) ?? null,
        servicos: [...servicos].sort((a, b) => (tsToDate(b.dataInicio)?.getTime() ?? 0) - (tsToDate(a.dataInicio)?.getTime() ?? 0)),
        competencias, tarefas, lancamentos, nfses, rascunhos,
        fiscal: fiscal[0] ?? null,
        pop: pop[0] ?? null,
        popNotas, comentarios,
        falhas,
        erroCliente,
        naoEncontrado: !erroCliente && !cliente,
      })
    }).finally(() => setCarregando(false))
  }, [acesso, clienteId])

  useEffect(() => {
    queueMicrotask(() => { void carregar() })
  }, [carregar])

  return { ...dados, carregando, acesso, recarregar: carregar, setDados }
}
