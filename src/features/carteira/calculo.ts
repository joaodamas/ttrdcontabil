/**
 * Cálculo da carteira recorrente — lógica pura, sem Firestore.
 *
 * Separada para ser testada. É a conta que responde "quanto entra por mês", e
 * ela erra fácil: contrato anual somado como se fosse mensal infla o número em
 * 12×, e contrato encerrado que ninguém desativou infla para sempre.
 */

export type FrequenciaContrato = 'mensal' | 'avulso' | 'anual' | 'trimestral'

export type ContratoCarteira = {
  id: string
  clienteId: string
  clienteNome?: string | null
  servicoNome?: string | null
  valor?: number | null
  frequencia?: string | null
  status?: string | null
  dataInicio?: Date | null
  dataFim?: Date | null
}

/** Quantas vezes por ano o contrato é faturado. Avulso não é recorrente. */
const VEZES_POR_ANO: Record<FrequenciaContrato, number> = {
  mensal: 12,
  trimestral: 4,
  anual: 1,
  avulso: 0,
}

/**
 * Valor mensalizado do contrato.
 *
 * Um contrato trimestral de R$ 3.000 vale R$ 1.000/mês de receita recorrente;
 * um anual de R$ 12.000 também. Sem essa normalização, "receita recorrente"
 * viraria a soma de coisas que não acontecem no mesmo intervalo — número que
 * parece certo e não é.
 *
 * Avulso devolve 0: não é receita recorrente, é evento.
 */
export function valorMensalizado(contrato: ContratoCarteira): number {
  const valor = contrato.valor ?? 0
  if (valor <= 0) return 0
  const freq = (contrato.frequencia ?? 'mensal') as FrequenciaContrato
  const vezes = VEZES_POR_ANO[freq] ?? 12 // frequência desconhecida: trata como mensal
  return (valor * vezes) / 12
}

/** Contrato vigente na data de referência: ativo e dentro da janela de vigência. */
export function contratoVigente(contrato: ContratoCarteira, referencia: Date): boolean {
  if ((contrato.status ?? 'ativo') !== 'ativo') return false
  if (contrato.dataInicio && contrato.dataInicio > referencia) return false
  if (contrato.dataFim && contrato.dataFim < referencia) return false
  return true
}

export type ResumoCarteira = {
  /** Receita recorrente mensalizada, só de contratos vigentes e não avulsos. */
  mrr: number
  contratosVigentes: number
  clientesComContrato: number
  /** MRR ÷ clientes com contrato. Zero clientes devolve 0, não NaN. */
  ticketMedio: number
  /** Quanto de MRR está em contrato não mensal — o que a mensalização "achatou". */
  mrrNaoMensal: number
  avulsosVigentes: number
}

export function resumirCarteira(contratos: ContratoCarteira[], referencia: Date): ResumoCarteira {
  const vigentes = contratos.filter((c) => contratoVigente(c, referencia))
  const recorrentes = vigentes.filter((c) => (c.frequencia ?? 'mensal') !== 'avulso')

  const mrr = recorrentes.reduce((soma, c) => soma + valorMensalizado(c), 0)
  const mrrNaoMensal = recorrentes
    .filter((c) => (c.frequencia ?? 'mensal') !== 'mensal')
    .reduce((soma, c) => soma + valorMensalizado(c), 0)

  const clientes = new Set(recorrentes.map((c) => c.clienteId))

  return {
    mrr,
    contratosVigentes: recorrentes.length,
    clientesComContrato: clientes.size,
    ticketMedio: clientes.size > 0 ? mrr / clientes.size : 0,
    mrrNaoMensal,
    avulsosVigentes: vigentes.length - recorrentes.length,
  }
}

export type ClienteNaCarteira = {
  clienteId: string
  clienteNome: string
  mrr: number
  contratos: number
  /** Fatia do MRR total, de 0 a 1. */
  fatia: number
}

/** Clientes ordenados por MRR, com a fatia de cada um no total. */
export function rankearClientes(
  contratos: ContratoCarteira[],
  referencia: Date,
): ClienteNaCarteira[] {
  const vigentes = contratos
    .filter((c) => contratoVigente(c, referencia))
    .filter((c) => (c.frequencia ?? 'mensal') !== 'avulso')

  const porCliente = new Map<string, ClienteNaCarteira>()
  for (const c of vigentes) {
    const atual = porCliente.get(c.clienteId) ?? {
      clienteId: c.clienteId,
      clienteNome: c.clienteNome ?? '—',
      mrr: 0,
      contratos: 0,
      fatia: 0,
    }
    atual.mrr += valorMensalizado(c)
    atual.contratos += 1
    if (!atual.clienteNome || atual.clienteNome === '—') atual.clienteNome = c.clienteNome ?? '—'
    porCliente.set(c.clienteId, atual)
  }

  const total = Array.from(porCliente.values()).reduce((s, c) => s + c.mrr, 0)
  return Array.from(porCliente.values())
    .map((c) => ({ ...c, fatia: total > 0 ? c.mrr / total : 0 }))
    .sort((a, b) => b.mrr - a.mrr)
}

export type ContratoVencendo = ContratoCarteira & {
  diasRestantes: number
  mrrEmRisco: number
}

/**
 * Contratos com `dataFim` dentro da janela — receita que vai sumir.
 *
 * Só existe porque `dataFim` passou a ser respeitada no faturamento: antes o
 * contrato encerrado seguia gerando cobrança, então "vencer" não significava
 * nada. Agora significa perder receita, e é a informação mais acionável da tela.
 */
export function contratosVencendoEm(
  contratos: ContratoCarteira[],
  referencia: Date,
  dias: number,
): ContratoVencendo[] {
  const limite = new Date(referencia)
  limite.setDate(limite.getDate() + dias)

  return contratos
    .filter((c) => contratoVigente(c, referencia))
    .filter((c) => (c.frequencia ?? 'mensal') !== 'avulso')
    .filter((c) => c.dataFim != null && c.dataFim <= limite)
    .map((c) => ({
      ...c,
      diasRestantes: Math.ceil((c.dataFim!.getTime() - referencia.getTime()) / 86_400_000),
      mrrEmRisco: valorMensalizado(c),
    }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
}

export type MovimentoCarteira = {
  entradas: ContratoCarteira[]
  saidas: ContratoCarteira[]
  mrrEntrou: number
  mrrSaiu: number
  saldo: number
}

/** Entradas e saídas de carteira dentro do mês de referência. */
export function movimentoDoMes(contratos: ContratoCarteira[], referencia: Date): MovimentoCarteira {
  const inicio = new Date(referencia.getFullYear(), referencia.getMonth(), 1)
  const fim = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0, 23, 59, 59)

  const recorrentes = contratos.filter((c) => (c.frequencia ?? 'mensal') !== 'avulso')
  const dentro = (d?: Date | null) => d != null && d >= inicio && d <= fim

  const entradas = recorrentes.filter((c) => dentro(c.dataInicio))
  const saidas = recorrentes.filter((c) => dentro(c.dataFim))

  const mrrEntrou = entradas.reduce((s, c) => s + valorMensalizado(c), 0)
  const mrrSaiu = saidas.reduce((s, c) => s + valorMensalizado(c), 0)

  return { entradas, saidas, mrrEntrou, mrrSaiu, saldo: mrrEntrou - mrrSaiu }
}
