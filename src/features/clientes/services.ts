import { where, orderBy, limit, type QueryConstraint } from 'firebase/firestore'
import { getDocument, listDocuments } from '@/lib/firestore-client'
import type { ClienteRecord, ClienteDetalheData } from './types'

export async function fetchClientes(params: {
  status?: string
  busca?: string
  page?: number
  pageSize?: number
} = {}): Promise<ClienteRecord[]> {
  const status = params.status === 'all' ? undefined : params.status
  const constraints: QueryConstraint[] = []
  if (status) constraints.push(where('status', '==', status))
  constraints.push(limit(500))

  const data = await listDocuments('clientes', constraints)
  return (data as ClienteRecord[])
    .filter((cliente) => !cliente.deletedAt)
    .sort((a, b) =>
      String(a.razaoSocial ?? a.nomeFantasia ?? a.id)
        .localeCompare(String(b.razaoSocial ?? b.nomeFantasia ?? b.id), 'pt-BR')
    )
}

export async function fetchClienteDetail(id: string): Promise<ClienteDetalheData> {
  function safe<T>(p: Promise<T>): Promise<T | null> { return p.catch(() => null) }

  const [clienteData, servicosData, competenciasData, lancamentosData, fiscalData] =
    await Promise.all([
      safe(getDocument('clientes', id)),
      safe(listDocuments('clientes_servicos', [where('clienteId', '==', id), limit(50)])),
      safe(listDocuments('competencias',      [where('clienteId', '==', id), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)])),
      safe(listDocuments('lancamentos',       [where('clienteId', '==', id), orderBy('dataVencimento', 'desc'), limit(20)])),
      safe(listDocuments('clientes_fiscal',   [where('clienteId', '==', id), limit(1)])),
    ])

  if (!clienteData) throw new Error(`Cliente ${id} não encontrado`)

  return {
    cliente:      clienteData  as ClienteDetalheData['cliente'],
    servicos:     ((servicosData ?? []) as ClienteDetalheData['servicos']).sort((a, b) => {
      const aDate = a.dataInicio?.toMillis?.() ?? 0
      const bDate = b.dataInicio?.toMillis?.() ?? 0
      return bDate - aDate
    }),
    competencias: (competenciasData ?? []) as ClienteDetalheData['competencias'],
    lancamentos:  (lancamentosData  ?? []) as ClienteDetalheData['lancamentos'],
    fiscal: fiscalData && fiscalData.length > 0
      ? fiscalData[0] as ClienteDetalheData['fiscal']
      : null,
  }
}
