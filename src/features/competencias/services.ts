import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import type { CompetenciaRecord, CompetenciasFilters } from './types'

/** Teto do histórico de um cliente (todos os meses): ~10 anos × alguns serviços. */
const LIMITE_HISTORICO_CLIENTE = 500

export async function fetchCompetencias(filters: CompetenciasFilters): Promise<CompetenciaRecord[]> {
  const page = Math.max(1, filters.page || 1)
  const pageSize = filters.pageSize ?? 20

  // Todos os meses de um cliente: o índice (tenantId, clienteId, ano desc,
  // mes desc) já existe. Status é filtrado aqui — clienteId + status + ano/mes
  // pediria um índice composto novo, e o histórico de um cliente cabe numa leitura.
  if (filters.mes == null || filters.ano == null) {
    if (!filters.clienteId) return []
    const data = (await listDocuments('competencias', [
      where('clienteId', '==', filters.clienteId),
      orderBy('ano', 'desc'),
      orderBy('mes', 'desc'),
      limit(LIMITE_HISTORICO_CLIENTE),
    ])) as CompetenciaRecord[]
    return filters.status ? data.filter((c) => c.status === filters.status) : data
  }

  const constraints: QueryConstraint[] = [
    where('mes', '==', filters.mes),
    where('ano', '==', filters.ano),
    ...(filters.status ? [where('status', '==', filters.status)] : []),
    ...(filters.clienteId ? [where('clienteId', '==', filters.clienteId)] : []),
    orderBy('clienteNome', 'asc'),
    limit(page * pageSize + 1),
  ]

  const data = await listDocuments('competencias', constraints)
  return data as CompetenciaRecord[]
}
