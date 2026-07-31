import { orderBy, Timestamp, where, type QueryConstraint } from 'firebase/firestore'
import { getClientesByIds, listDocumentsPage, sumDocuments, type FirestoreCursor } from '@/lib/firestore-client'
import type {
  FinanceiroAgregados,
  FinanceiroAgregadosFilters,
  FinanceiroListFilters,
  FinanceiroSnapshot,
  LancamentoRecord,
} from './types'

const DEFAULT_PAGE_SIZE = 20
const MAX_FETCHED_ROWS = 200

/**
 * Teto da varredura dos agregados e tamanho de cada ida ao Firestore.
 *
 * O teto existe para não varrer sem limite se a base crescer muito; quando ele
 * é atingido, `truncado` avisa na tela e os exports são bloqueados, em vez de
 * entregar meia planilha com cara de planilha inteira. Mesmo padrão da
 * carteira (features/carteira/services.ts).
 */
const TETO_AGREGADOS = 5000
const LOTE_AGREGADOS = 500

type PaginaLancamentos = {
  rows: Array<LancamentoRecord & { id: string }>
  lastCursor: FirestoreCursor | null
  cursors: FirestoreCursor[]
}

/**
 * Uma única fonte para os filtros: a varredura dos agregados precisa enxergar
 * exatamente o mesmo conjunto que a tabela mostra. Duas listas de constraints
 * separadas divergem na primeira manutenção — e divergência aqui significa a
 * tela exibindo dois totais diferentes para o mesmo dinheiro.
 */
function construirConstraints(
  filters: FinanceiroAgregadosFilters,
  hojeTs: Timestamp
): QueryConstraint[] {
  return [
    ...(filters.clienteId ? [where('clienteId', '==', filters.clienteId)] : []),
    ...(filters.competenciaId ? [where('competenciaId', '==', filters.competenciaId)] : []),
    ...(filters.tipo ? [where('tipo', '==', filters.tipo)] : []),
    ...(filters.status === 'atrasado'
      ? [where('status', '==', 'pendente'), where('dataVencimento', '<', hojeTs)]
      : filters.status
        ? [where('status', '==', filters.status)]
        : []),
    orderBy('dataVencimento', 'desc'),
  ]
}

/**
 * `clienteNome` é denormalizado no lançamento, mas nem todo documento antigo
 * tem. Sem o nome, o agrupamento por cliente joga tudo em "Sem cliente" — o
 * ranking de inadimplentes e a planilha de cobrança ficam inúteis.
 */
async function preencherClienteNome(rows: LancamentoRecord[]): Promise<LancamentoRecord[]> {
  const clientesSemNome = [
    ...new Set(
      rows
        .filter((l) => !l.clienteNome && typeof l.clienteId === 'string')
        .map((l) => l.clienteId as string)
    ),
  ]
  if (clientesSemNome.length === 0) return rows

  const clientes = await getClientesByIds(clientesSemNome)
  const clientePorId = new Map(
    clientes.map((c) => [
      c.id,
      { razaoSocial: c.razaoSocial as string | undefined, nomeFantasia: c.nomeFantasia as string | undefined },
    ])
  )

  return rows.map((l) => {
    if (l.clienteNome || typeof l.clienteId !== 'string') return l
    const cliente = clientePorId.get(l.clienteId)
    const nome = cliente?.razaoSocial ?? cliente?.nomeFantasia
    return nome ? { ...l, clienteNome: nome } : l
  })
}

export async function fetchFinanceiroSnapshot(filters: FinanceiroListFilters): Promise<FinanceiroSnapshot> {
  const hoje = new Date()
  const hojeTs = Timestamp.fromDate(hoje)
  const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))
  const pageSize = Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE)
  const fetchLimit = Math.min(pageSize + 1, MAX_FETCHED_ROWS)

  const constraints = construirConstraints(filters, hojeTs)

  // Os três KPIs são somados pelo servidor (agregação), não em memória.
  // Antes vinham de um listDocuments com limit(500) + reduce: com 119 clientes
  // o histórico ultrapassa 500 lançamentos em poucos meses e o KPI congelava
  // sem erro nenhum — o número simplesmente parava de crescer.
  // Sem orderBy de propósito: em soma ele não ordena nada, só serviria para
  // exigir índice a mais (e excluir documentos sem o campo).
  const [mainPage, somaAReceber, somaRecebidoMes, somaEmAtraso] = await Promise.all([
    listDocumentsPage<LancamentoRecord>('lancamentos', constraints, filters.cursor, fetchLimit),
    sumDocuments('lancamentos', 'valor', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pendente'),
    ]),
    sumDocuments('lancamentos', 'valor', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pago'),
      where('dataPagamento', '>=', inicioMes),
      where('dataPagamento', '<=', fimMes),
    ]),
    sumDocuments('lancamentos', 'valor', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pendente'),
      where('dataVencimento', '<', hojeTs),
    ]),
  ])

  const rows = mainPage.rows
  const hasMore = rows.length > pageSize
  const allLancamentos = await preencherClienteNome(rows.slice(0, pageSize))

  return {
    allLancamentos,
    hasMore,
    lastCursor: hasMore ? (mainPage.cursors[pageSize - 1] ?? null) : null,
    somaAReceber,
    somaRecebidoMes,
    somaEmAtraso,
  }
}

/**
 * Varre a base inteira do filtro atual, página por página, até acabar.
 *
 * O defeito que isto corrige: aging, top inadimplentes, alertas, previsão, fila
 * de cobrança e o export de inadimplência eram calculados sobre as 20 linhas da
 * página aberta. A planilha saía com cara de relatório completo e tinha 20
 * linhas — dá para cobrar o cliente errado com base nela.
 *
 * A soma dos KPIs continua sendo feita pelo servidor (sumDocuments), que é mais
 * barato; a varredura existe para o que agregação não faz: agrupar por cliente
 * e distribuir em faixas de atraso.
 */
export async function fetchFinanceiroAgregados(
  filters: FinanceiroAgregadosFilters
): Promise<FinanceiroAgregados> {
  const hojeTs = Timestamp.fromDate(new Date())
  const constraints = construirConstraints(filters, hojeTs)

  const lidos: LancamentoRecord[] = []
  let cursor: FirestoreCursor | null = null

  while (lidos.length < TETO_AGREGADOS) {
    const lote = Math.min(LOTE_AGREGADOS, TETO_AGREGADOS - lidos.length)
    // Anotação explícita: sem ela o TS tenta inferir `pagina` a partir de
    // `cursor`, que é reatribuído com `pagina.lastCursor` — referência circular.
    const pagina: PaginaLancamentos =
      await listDocumentsPage<LancamentoRecord>('lancamentos', constraints, cursor, lote)
    lidos.push(...pagina.rows)
    // Lote incompleto significa fim da coleção — parar aqui evita uma ida a mais.
    if (pagina.rows.length < lote || !pagina.lastCursor) break
    cursor = pagina.lastCursor
  }

  const lancamentos = await preencherClienteNome(lidos)

  return {
    lancamentos,
    total: lancamentos.length,
    // Bateu o teto: assume-se que há mais e a tela avisa, em vez de exibir um
    // total que parece completo.
    truncado: lancamentos.length >= TETO_AGREGADOS,
    teto: TETO_AGREGADOS,
  }
}
