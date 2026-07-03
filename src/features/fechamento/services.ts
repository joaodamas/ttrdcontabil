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
  // Estado de trava do mês (congelamento pós-revisão).
  travado?: boolean
  travadoEm?: string
  travadoPorId?: string
  travadoPorNome?: string
  // Preenchido quando um admin reabre o mês para novas edições.
  reabertoEm?: string
  reabertoPorId?: string
  reabertoPorNome?: string
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
  const revisadoEm = new Date().toISOString()
  const payload = {
    ano,
    mes,
    nota,
    uid,
    nomeUsuario,
    revisadoEm,
    ...snapshot,
    // Encerrar a revisão trava o mês: a tabela deixa de ser editável até
    // um admin reabrir explicitamente (ver `reabrirMes`).
    travado: true,
    travadoEm: revisadoEm,
    travadoPorId: uid,
    travadoPorNome: nomeUsuario,
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

/**
 * Reabre um mês previamente travado por `salvarRevisao`, permitindo edições
 * novamente. Não apaga o histórico da revisão anterior — apenas marca
 * `travado: false` e registra quem/quando reabriu, para auditoria.
 * A checagem de perfil (somente admin) é responsabilidade da tela chamadora.
 */
export async function reabrirMes(
  ano: number,
  mes: number,
  uid: string,
  nomeUsuario: string
): Promise<void> {
  const id = `${ano}_${String(mes).padStart(2, '0')}`
  const revisao = await buscarRevisao(ano, mes)
  if (!revisao) {
    throw new Error('Não há revisão registrada para este mês.')
  }

  const reabertoEm = new Date().toISOString()
  await updateDocument('fechamento_revisoes', id, {
    travado: false,
    reabertoEm,
    reabertoPorId: uid,
    reabertoPorNome: nomeUsuario,
  })

  await createDocument('events', {
    tipo: 'fechamento',
    titulo: `Mês reaberto para edição - ${String(mes).padStart(2, '0')}/${ano}`,
    descricao: `A trava de revisão de ${String(mes).padStart(2, '0')}/${ano} foi removida por ${nomeUsuario}.`,
    origemColecao: 'fechamento_revisoes',
    origemId: id,
    actorId: uid,
    actorNome: nomeUsuario,
    metadata: {
      severidade: 'media',
      href: `/fechamento?mes=${mes}&ano=${ano}`,
    },
    criadoEm: Timestamp.now(),
  })
}

export async function fetchFechamentos(filters: FechamentoFilters): Promise<FechamentoRecord[]> {
  const data = await getFechamentos(filters.mes, filters.ano, filters.regime || undefined)
  return data as FechamentoRecord[]
}

export async function updateFechamentoField(
  id: string,
  field: string,
  value: string,
  ano: number,
  mes: number
) {
  // Enforcement em nível de app: o mês travado por `salvarRevisao` não pode
  // ser editado até um admin chamar `reabrirMes`. A garantia forte (Firestore
  // rules / server-side) está prevista no lote de RBAC, ainda não aplicado aqui.
  const revisao = await buscarRevisao(ano, mes)
  if (revisao?.travado) {
    throw new Error('Este mês já foi revisado e está travado. Reabra o mês para editar.')
  }
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
