import { orderBy, Timestamp, where, type QueryConstraint } from 'firebase/firestore'
import { getClientesByIds, listDocuments } from '@/lib/firestore-client'
import type { FinanceiroBaseFilters, FinanceiroSnapshot, LancamentoRecord } from './types'

export async function fetchFinanceiroSnapshot(filters: FinanceiroBaseFilters): Promise<FinanceiroSnapshot> {
  const hoje = new Date()
  const hojeTs = Timestamp.fromDate(hoje)
  const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))

  const constraints: QueryConstraint[] = [
    ...(filters.clienteId ? [where('clienteId', '==', filters.clienteId)] : []),
    ...(filters.competenciaId ? [where('competenciaId', '==', filters.competenciaId)] : []),
    orderBy('dataVencimento', 'asc'),
  ]

  const [mainData, aReceberData, recebidoMesData, emAtrasoData] = await Promise.all([
    listDocuments('lancamentos', constraints),
    listDocuments('lancamentos', [where('tipo', '==', 'receita'), where('status', '==', 'pendente')]),
    listDocuments('lancamentos', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pago'),
      where('dataPagamento', '>=', inicioMes),
      where('dataPagamento', '<=', fimMes),
    ]),
    listDocuments('lancamentos', [
      where('tipo', '==', 'receita'),
      where('status', '==', 'pendente'),
      where('dataVencimento', '<', hojeTs),
    ]),
  ])

  const lancamentosRaw = mainData as LancamentoRecord[]
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
    somaAReceber: (aReceberData as LancamentoRecord[]).reduce((acc, d) => acc + (d.valor ?? 0), 0),
    somaRecebidoMes: (recebidoMesData as LancamentoRecord[]).reduce((acc, d) => acc + (d.valor ?? 0), 0),
    somaEmAtraso: (emAtrasoData as LancamentoRecord[]).reduce((acc, d) => acc + (d.valor ?? 0), 0),
  }
}
