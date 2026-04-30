import { Timestamp } from 'firebase/firestore'
import { getHojeCockpit, getUsuarios, updateDocument } from '@/lib/firestore-client'
import type { HojeCockpitData, HojeUsuario } from './types'

export async function fetchHojeCockpit(responsavelId?: string): Promise<HojeCockpitData> {
  return getHojeCockpit({ responsavelId }) as Promise<HojeCockpitData>
}

export async function fetchUsuarios(): Promise<HojeUsuario[]> {
  return getUsuarios() as Promise<HojeUsuario[]>
}

export async function bulkConcluirTarefas(ids: string[]) {
  await Promise.all(
    ids.map((id) => updateDocument('tarefas', id, { status: 'concluida', dataConclusao: Timestamp.now() }))
  )
}

export async function bulkReatribuirTarefas(
  ids: string[],
  responsavelId: string,
  responsavelNome: string
) {
  await Promise.all(
    ids.map((id) => updateDocument('tarefas', id, { responsavelId, responsavelNome }))
  )
}

export async function bulkAlterarPrazo(ids: string[], isoDate: string) {
  const dataPrazo = Timestamp.fromDate(new Date(`${isoDate}T12:00:00`))
  await Promise.all(ids.map((id) => updateDocument('tarefas', id, { dataPrazo })))
}
