import { orderBy, Timestamp, where, type QueryConstraint } from 'firebase/firestore'
import { getClientesByIds, listDocumentsPage, sumDocuments } from '@/lib/firestore-client'
import type { FinanceiroListFilters, FinanceiroSnapshot, LancamentoRecord } from './types'

const DEFAULT_PAGE_SIZE = 20
const MAX_FETCHED_ROWS = 200

export async function fetchFinanceiroSnapshot(filters: FinanceiroListFilters): Promise<FinanceiroSnapshot> {
  const hoje = new Date()
  const hojeTs = Timestamp.fromDate(hoje)
  const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))
  const pageSize = Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE)
  const fetchLimit = Math.min(pageSize + 1, MAX_FETCHED_ROWS)

  const constraints: QueryConstraint[] = [
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
  const lancamentosRaw = rows.slice(0, pageSize)
  const clientesSemNome = [
    ...new Set(
      lancamentosRaw
        .filter((l) => !l.clienteNome && typeof l.clienteId === 'string')
        .map((l) => l.clienteId as string)
    ),
  ]

  let allLancamentos = lancamentosRaw
  if (clientesSemNome.length > 0) {
    const clientes = await getClientesByIds(clientesSemNome)
    const clientePorId = new Map(
      clientes.map((c) => [
        c.id,
        { razaoSocial: c.razaoSocial as string | undefined, nomeFantasia: c.nomeFantasia as string | undefined },
      ])
    )
    allLancamentos = lancamentosRaw.map((l) => {
      if (l.clienteNome || typeof l.clienteId !== 'string') return l
      const cliente = clientePorId.get(l.clienteId)
      const nome = cliente?.razaoSocial ?? cliente?.nomeFantasia
      return nome ? { ...l, clienteNome: nome } : l
    })
  }

  return {
    allLancamentos,
    hasMore,
    lastCursor: hasMore ? (mainPage.cursors[pageSize - 1] ?? null) : null,
    somaAReceber,
    somaRecebidoMes,
    somaEmAtraso,
  }
}
