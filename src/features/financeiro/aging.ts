/**
 * Aging de recebíveis e inadimplência — lógica pura, sem Firestore.
 *
 * Estava dentro de central-cobranca.tsx e do onClick do export, alimentada pela
 * página atual da tabela (20 linhas). Foi separada aqui por dois motivos: para
 * poder ser testada, e porque o mesmo cálculo agora responde por três coisas
 * que precisam bater entre si — as faixas do aging, o ranking de inadimplentes
 * e a planilha de cobrança.
 */
import { tsToDate } from '@/lib/utils'

export type VarianteFaixa = 'success' | 'warning' | 'destructive' | 'neutral'

export type FaixaAging = {
  label: string
  /** Dias de atraso [min, max]; max = Infinity na faixa aberta. */
  dias: [number, number]
  variant: VarianteFaixa
  /** Falso só na faixa "A vencer" — o que ainda não é dívida. */
  vencida: boolean
}

/**
 * O que ainda não venceu. Não é uma faixa de dias: é decidido pela data.
 *
 * Armadilha: com floor() sobre a diferença em milissegundos, o que venceu há
 * 3 horas dá 0 dia de atraso e caía aqui — enquanto o card "Em Atraso" no topo
 * (agregação no servidor, `dataVencimento < agora`) já contava esse dinheiro
 * como atrasado. O mesmo valor aparecia duas vezes na mesma tela com dois
 * números. Agora "vencido" é sempre a comparação de datas, e o dia de atraso
 * só decide em QUAL faixa vencida o valor cai.
 */
export const FAIXA_A_VENCER: FaixaAging = {
  label: 'A vencer',
  dias: [-Infinity, -1],
  variant: 'success',
  vencida: false,
}

/** Faixas de atraso. Começam em 0 dia porque "vencido hoje cedo" já é atraso. */
export const FAIXAS_VENCIDAS: FaixaAging[] = [
  { label: '1–15 dias',  dias: [0, 15],        variant: 'warning',     vencida: true },
  { label: '16–30 dias', dias: [16, 30],       variant: 'warning',     vencida: true },
  { label: '31–60 dias', dias: [31, 60],       variant: 'destructive', vencida: true },
  { label: '61+ dias',   dias: [61, Infinity], variant: 'destructive', vencida: true },
]

export type FaixaAgingCalculada = FaixaAging & {
  total: number
  quantidade: number
}

/** Recorte mínimo de um lançamento para o aging — sem Timestamp, sem Firestore. */
export type ItemAging = {
  clienteNome: string | null
  valor: number
  vencimento: Date | null
  /** Receita pendente: o único recorte que é recebível em aberto. */
  recebivelEmAberto: boolean
}

export function paraItemAging(lancamento: Record<string, unknown>): ItemAging {
  const nome = typeof lancamento.clienteNome === 'string' ? lancamento.clienteNome.trim() : ''
  return {
    clienteNome: nome.length > 0 ? nome : null,
    valor: Number(lancamento.valor) || 0,
    vencimento: tsToDate(lancamento.dataVencimento),
    recebivelEmAberto: lancamento.tipo === 'receita' && lancamento.status === 'pendente',
  }
}

/** Dias inteiros de atraso. Só faz sentido para vencimento já passado. */
export function diasDeAtraso(vencimento: Date, agora: Date): number {
  return Math.floor((agora.getTime() - vencimento.getTime()) / 86_400_000)
}

/** Vencido é comparação de data, não arredondamento de dias. */
export function estaVencido(item: ItemAging, agora: Date): boolean {
  return item.recebivelEmAberto && item.vencimento != null && item.vencimento < agora
}

/**
 * Distribui os recebíveis em aberto nas faixas.
 *
 * Lançamento sem vencimento fica de fora de propósito: não dá para afirmar que
 * está em dia nem que está atrasado, e chutar uma faixa é inventar dívida.
 */
export function calcularAging(itens: ItemAging[], agora: Date): FaixaAgingCalculada[] {
  const aVencer: FaixaAgingCalculada = { ...FAIXA_A_VENCER, total: 0, quantidade: 0 }
  const vencidas: FaixaAgingCalculada[] = FAIXAS_VENCIDAS.map((faixa) => ({
    ...faixa,
    total: 0,
    quantidade: 0,
  }))

  for (const item of itens) {
    if (!item.recebivelEmAberto || !item.vencimento) continue

    if (!estaVencido(item, agora)) {
      aVencer.total += item.valor
      aVencer.quantidade += 1
      continue
    }

    const dias = diasDeAtraso(item.vencimento, agora)
    const faixa = vencidas.find((f) => dias >= f.dias[0] && dias <= f.dias[1])
    if (!faixa) continue // as faixas cobrem [0, ∞): só chega aqui com data inválida
    faixa.total += item.valor
    faixa.quantidade += 1
  }

  return [aVencer, ...vencidas]
}

/** Soma das faixas vencidas — é o número que precisa bater com o card "Em Atraso". */
export function totalVencido(faixas: FaixaAgingCalculada[]): number {
  return faixas.filter((f) => f.vencida).reduce((soma, f) => soma + f.total, 0)
}

/** Soma de tudo que está em aberto (a vencer + vencido). Base das barras. */
export function totalEmAberto(faixas: FaixaAgingCalculada[]): number {
  return faixas.reduce((soma, f) => soma + f.total, 0)
}

export type LinhaInadimplencia = {
  cliente: string
  quantidade: number
  total: number
  vencimentoMaisAntigo: Date
}

/**
 * Inadimplência agrupada por cliente — o conteúdo da planilha de cobrança.
 *
 * Armadilha do código anterior: o vencimento mais antigo era guardado já
 * formatado ("dd/mm/aaaa") e recomparado desmontando a string. Comparação de
 * data feita por texto erra silenciosamente e o resultado ia para a planilha
 * que o escritório usa para cobrar. Aqui a comparação é entre Dates.
 */
export function agruparInadimplencia(itens: ItemAging[], agora: Date): LinhaInadimplencia[] {
  const porCliente = new Map<string, LinhaInadimplencia>()

  for (const item of itens) {
    if (!estaVencido(item, agora) || !item.vencimento) continue
    const cliente = item.clienteNome ?? 'Sem cliente'
    const atual = porCliente.get(cliente)

    if (!atual) {
      porCliente.set(cliente, {
        cliente,
        quantidade: 1,
        total: item.valor,
        vencimentoMaisAntigo: item.vencimento,
      })
      continue
    }

    atual.quantidade += 1
    atual.total += item.valor
    if (item.vencimento < atual.vencimentoMaisAntigo) atual.vencimentoMaisAntigo = item.vencimento
  }

  return [...porCliente.values()].sort((a, b) => b.total - a.total)
}
