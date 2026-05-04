import { where, orderBy, limit } from 'firebase/firestore'
import { getClientes, getDocument, listDocuments } from '@/lib/firestore-client'
import type { ClienteRecord, ClienteDetalheData } from './types'

export async function fetchClientes(status?: string): Promise<ClienteRecord[]> {
  const data = await getClientes(status ? { status } : {})
  return data as ClienteRecord[]
}

export async function fetchClienteDetail(id: string): Promise<ClienteDetalheData> {
  function safe<T>(p: Promise<T>): Promise<T | null> { return p.catch(() => null) }

  const [clienteData, servicosData, competenciasData, lancamentosData, fiscalData] =
    await Promise.all([
      safe(getDocument('clientes', id)),
      safe(listDocuments('clientes_servicos', [where('clienteId', '==', id), orderBy('dataInicio', 'desc'), limit(50)])),
      safe(listDocuments('competencias',      [where('clienteId', '==', id), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)])),
      safe(listDocuments('lancamentos',       [where('clienteId', '==', id), orderBy('dataVencimento', 'desc'), limit(20)])),
      safe(listDocuments('clientes_fiscal',   [where('clienteId', '==', id), limit(1)])),
    ])

  if (!clienteData) throw new Error(`Cliente ${id} não encontrado`)

  return {
    cliente:      clienteData  as ClienteDetalheData['cliente'],
    servicos:     (servicosData    ?? []) as ClienteDetalheData['servicos'],
    competencias: (competenciasData ?? []) as ClienteDetalheData['competencias'],
    lancamentos:  (lancamentosData  ?? []) as ClienteDetalheData['lancamentos'],
    fiscal: fiscalData && fiscalData.length > 0
      ? fiscalData[0] as ClienteDetalheData['fiscal']
      : null,
  }
}
