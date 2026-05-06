import { Timestamp, doc, getDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getClientDb, getFirebaseApp } from '@/lib/firebase'
import { createDocument, getFechamentos, setDocument, updateDocument } from '@/lib/firestore-client'
import type { FechamentoFilters, FechamentoRecord } from './types'

export type RevisaoRecord = {
  ano: number
  mes: number
  nota: string
  uid: string
  nomeUsuario: string
  revisadoEm: string
  totalFechamentos?: number
  pendentes?: number
  parciais?: number
  enviados?: number
  snapshotStatus?: Record<string, number>
}

export type GerarFechamentoResult = {
  criados: number
  ignorados: number
  totalClientes: number
}

export async function salvarRevisao(
  ano: number,
  mes: number,
  nota: string,
  uid: string,
  nomeUsuario: string,
  snapshot: {
    totalFechamentos: number
    pendentes: number
    parciais: number
    enviados: number
    snapshotStatus: Record<string, number>
  }
): Promise<void> {
  const id = `${ano}_${String(mes).padStart(2, '0')}`
  const payload = {
    ano,
    mes,
    nota,
    uid,
    nomeUsuario,
    revisadoEm: new Date().toISOString(),
    ...snapshot,
  }

  const existing = await getDoc(doc(getClientDb(), 'fechamento_revisoes', id))
  if (existing.exists()) {
    await updateDocument('fechamento_revisoes', id, payload)
  } else {
    await setDocument('fechamento_revisoes', id, payload)
  }

  await createDocument('events', {
    tipo: 'fechamento',
    titulo: `Revisão de fechamento encerrada - ${String(mes).padStart(2, '0')}/${ano}`,
    descricao: `${snapshot.enviados}/${snapshot.totalFechamentos} fechamento(s) concluídos. Pendentes: ${snapshot.pendentes}. Parciais: ${snapshot.parciais}.`,
    origemColecao: 'fechamento_revisoes',
    origemId: id,
    actorId: uid,
    actorNome: nomeUsuario,
    metadata: {
      severidade: snapshot.pendentes > 0 || snapshot.parciais > 0 ? 'alta' : 'baixa',
      href: `/fechamento?mes=${mes}&ano=${ano}`,
      ...snapshot,
    },
    criadoEm: Timestamp.now(),
  })
}

export async function buscarRevisao(ano: number, mes: number): Promise<RevisaoRecord | null> {
  const id = `${ano}_${String(mes).padStart(2, '0')}`
  const snap = await getDoc(doc(getClientDb(), 'fechamento_revisoes', id))
  if (!snap.exists()) return null
  return snap.data() as RevisaoRecord
}

export async function fetchFechamentos(filters: FechamentoFilters): Promise<FechamentoRecord[]> {
  const data = await getFechamentos(filters.mes, filters.ano, filters.regime || undefined)
  return data as FechamentoRecord[]
}

export async function updateFechamentoField(id: string, field: string, value: string) {
  await updateDocument('fechamentos', id, { [field]: value })
}

export async function gerarFechamentoMensal(
  filters: FechamentoFilters
): Promise<GerarFechamentoResult> {
  const callable = httpsCallable<
    { mes: number; ano: number; regime?: string },
    GerarFechamentoResult
  >(getFunctions(getFirebaseApp(), 'southamerica-east1'), 'gerarFechamentoMensal')

  const result = await callable({
    mes: filters.mes,
    ano: filters.ano,
    regime: filters.regime || undefined,
  })

  return result.data
}
