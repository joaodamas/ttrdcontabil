import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import type { CompetenciaRecord, CompetenciasFilters } from './types'

export async function fetchCompetencias(filters: CompetenciasFilters): Promise<CompetenciaRecord[]> {
  const page = Math.max(1, filters.page || 1)
  const pageSize = filters.pageSize ?? 20
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
