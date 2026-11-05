import { useMemo } from 'react'
import { tsToDate } from '@/lib/utils'
import { somenteDigitos } from '@/features/tomadores/validacao'
import type { NfseRecorrenteRecord } from './types'
import { useContratosRecorrentesQuery } from './queries'
import { contratoVigenteEm, proximaEmissao, totalMensalVigente, type ContratoRecorrenteCalculo } from './calculo'

/** Converte o documento cru no formato que o módulo puro de cálculo entende. */
export function paraCalculo(contrato: NfseRecorrenteRecord): ContratoRecorrenteCalculo {
  return {
    ativo: contrato.ativo,
    valor: contrato.valor,
    diaEmissao: contrato.diaEmissao,
    dataInicio: tsToDate(contrato.dataInicio),
    dataFim: tsToDate(contrato.dataFim),
  }
}

export type ContratoNaTela = NfseRecorrenteRecord & {
  vigente: boolean
  /** `null` quando o contrato não emite mais (suspenso ou fora da vigência). */
  proxima: Date | null
}

export function useContratosRecorrentes(params: {
  clienteId: string
  busca?: string
  incluirEncerrados?: boolean
  referencia?: Date
}) {
  const query = useContratosRecorrentesQuery(params.clienteId)
  const contratos = useMemo(() => query.data?.contratos ?? [], [query.data])

  // Uma referência estável por render evita "hoje" mudando entre dois cálculos
  // da mesma lista — o tipo de detalhe que faz duas colunas discordarem.
  const referencia = params.referencia ?? new Date()
  const referenciaMs = referencia.getTime()

  const todos = useMemo<ContratoNaTela[]>(() => {
    const ref = new Date(referenciaMs)
    return contratos.map((c) => {
      const calc = paraCalculo(c)
      return { ...c, vigente: contratoVigenteEm(calc, ref), proxima: proximaEmissao(calc, ref) }
    })
  }, [contratos, referenciaMs])

  const visiveis = useMemo(() => {
    const termo = (params.busca ?? '').trim().toLowerCase()
    const documento = somenteDigitos(params.busca)
    return todos
      .filter((c) => (params.incluirEncerrados ? true : c.vigente))
      .filter((c) => {
        if (!termo) return true
        return (
          String(c.tomadorNome ?? '').toLowerCase().includes(termo) ||
          String(c.descricao ?? '').toLowerCase().includes(termo) ||
          (documento !== '' && String(c.tomadorCpfCnpj ?? '').includes(documento))
        )
      })
      .sort((a, b) => String(a.tomadorNome ?? '').localeCompare(String(b.tomadorNome ?? ''), 'pt-BR'))
  }, [todos, params.busca, params.incluirEncerrados])

  const totalMensal = useMemo(
    () => totalMensalVigente(contratos.map(paraCalculo), new Date(referenciaMs)),
    [contratos, referenciaMs]
  )

  return {
    ...query,
    todos,
    visiveis,
    totalMensal,
    vigentes: useMemo(() => todos.filter((c) => c.vigente).length, [todos]),
    truncado: query.data?.truncado ?? false,
  }
}
