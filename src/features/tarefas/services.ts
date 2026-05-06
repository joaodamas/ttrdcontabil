import { limit, orderBy, Timestamp, where, type QueryConstraint } from 'firebase/firestore'
import { listDocuments, updateDocument } from '@/lib/firestore-client'
import type { TarefaRecord, TarefasFilters } from './types'

export async function fetchTarefas(filters: TarefasFilters): Promise<TarefaRecord[]> {
  const page = Math.max(1, filters.page || 1)
  const pageSize = filters.pageSize ?? 20
  const constraints: QueryConstraint[] = [
    ...(filters.status ? [where('status', '==', filters.status)] : []),
    ...(filters.prioridade ? [where('prioridade', '==', filters.prioridade)] : []),
    ...(filters.responsavelId ? [where('responsavelId', '==', filters.responsavelId)] : []),
    ...(filters.clienteId ? [where('clienteId', '==', filters.clienteId)] : []),
    ...(filters.competenciaId ? [where('competenciaId', '==', filters.competenciaId)] : []),
    orderBy('dataPrazo', 'asc'),
    limit(page * pageSize + 1),
  ]
  const data = await listDocuments('tarefas', constraints)
  return data as TarefaRecord[]
}

export async function concluirTarefa(id: string) {
  await updateDocument('tarefas', id, { status: 'concluida', dataConclusao: Timestamp.now() })
}
