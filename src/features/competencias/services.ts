import { orderBy, where, type QueryConstraint } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import type { CompetenciaRecord, CompetenciasFilters } from './types'

export async function fetchCompetencias(filters: CompetenciasFilters): Promise<CompetenciaRecord[]> {
  const constraints: QueryConstraint[] = [
    where('mes', '==', filters.mes),
    where('ano', '==', filters.ano),
    ...(filters.status ? [where('status', '==', filters.status)] : []),
    ...(filters.clienteId ? [where('clienteId', '==', filters.clienteId)] : []),
    orderBy('clienteNome', 'asc'),
  ]

  const data = await listDocuments('competencias', constraints)
  return data as CompetenciaRecord[]
}
