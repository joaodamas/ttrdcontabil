import { limit, orderBy, Timestamp, where, type QueryConstraint } from 'firebase/firestore'
import { getClientesByIds, listDocuments, listDocumentsPage } from '@/lib/firestore-client'
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

  const [mainPage, aReceberData, recebidoMesData, emAtrasoData] = await Promise.all([
    listDocumentsPage<LancamentoRecord>('lancamentos', constraints, filters.cursor, fetchLimit),
    listDocuments('lancamentos', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pendente'),
      orderBy('dataVencimento', 'asc'),
      limit(500),
    ]),
    listDocuments('lancamentos', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pago'),
      where('dataPagamento', '>=', inicioMes),
      where('dataPagamento', '<=', fimMes),
      orderBy('dataPagamento', 'asc'),
      limit(500),
    ]),
    listDocuments('lancamentos', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pendente'),
      where('dataVencimento', '<', hojeTs),
      orderBy('dataVencimento', 'asc'),
      limit(500),
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
    somaAReceber: (aReceberData as LancamentoRecord[]).reduce((acc, d) => acc + (d.valor ?? 0), 0),
    somaRecebidoMes: (recebidoMesData as LancamentoRecord[]).reduce((acc, d) => acc + (d.valor ?? 0), 0),
    somaEmAtraso: (emAtrasoData as LancamentoRecord[]).reduce((acc, d) => acc + (d.valor ?? 0), 0),
  }
}
