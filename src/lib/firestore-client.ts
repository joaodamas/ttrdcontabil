/**
 * Client-side Firestore query helpers — used in 'use client' pages.
 * Replaces all server-side adminDb calls.
 */
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Generic helpers ───────────────────────────────────────────────────────────

export async function getDocument<T>(col: string, id: string): Promise<(T & { id: string }) | null> {
  const snap = await getDoc(doc(db, col, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as T) }
}

export async function listDocuments<T>(
  col: string,
  constraints: QueryConstraint[] = []
): Promise<Array<T & { id: string }>> {
  const q = query(collection(db, col), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))
}

export async function createDocument(col: string, data: Record<string, unknown>) {
  const ref = await addDoc(collection(db, col), { ...data, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() })
  return ref.id
}

export async function updateDocument(col: string, id: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, col, id), { ...data, atualizadoEm: serverTimestamp() })
}

export async function deleteDocument(col: string, id: string) {
  await deleteDoc(doc(db, col, id))
}

// ── Domain queries ────────────────────────────────────────────────────────────

export async function getClientes(opts: { status?: string; limit?: number } = {}) {
  const constraints: QueryConstraint[] = [orderBy('razaoSocial')]
  if (opts.status) constraints.push(where('status', '==', opts.status))
  constraints.push(limit(opts.limit ?? 500))
  return listDocuments('clientes', constraints)
}

export async function getCliente(id: string) {
  return getDocument('clientes', id)
}

export async function getServicos() {
  return listDocuments('servicos', [orderBy('nome'), limit(500)])
}

export async function getClienteServicos(clienteId: string) {
  return listDocuments('clientes_servicos', [
    where('clienteId', '==', clienteId),
    orderBy('dataInicio', 'desc'),
  ])
}

export async function getCompetencias(opts: { clienteId?: string; limit?: number } = {}) {
  const c: QueryConstraint[] = [orderBy('ano', 'desc'), orderBy('mes', 'desc')]
  if (opts.clienteId) c.push(where('clienteId', '==', opts.clienteId))
  c.push(limit(opts.limit ?? 200))
  return listDocuments('competencias', c)
}

export async function getLancamentos(opts: { clienteId?: string; status?: string; limit?: number } = {}) {
  const c: QueryConstraint[] = [orderBy('dataVencimento', 'desc')]
  if (opts.clienteId) c.push(where('clienteId', '==', opts.clienteId))
  if (opts.status)    c.push(where('status', '==', opts.status))
  c.push(limit(opts.limit ?? 200))
  return listDocuments('lancamentos', c)
}

export async function getTarefas(opts: { responsavelId?: string; status?: string; limit?: number } = {}) {
  const c: QueryConstraint[] = [orderBy('dataVencimento', 'asc')]
  if (opts.responsavelId) c.push(where('responsavelId', '==', opts.responsavelId))
  if (opts.status)        c.push(where('status', '==', opts.status))
  c.push(limit(opts.limit ?? 200))
  return listDocuments('tarefas', c)
}

export async function getFechamentos(mes: number, ano: number, regime?: string) {
  const c: QueryConstraint[] = [
    where('mes', '==', mes),
    where('ano', '==', ano),
    orderBy('clienteCodigo', 'asc'),
  ]
  if (regime) c.push(where('regime', '==', regime))
  return listDocuments('fechamentos', c)
}

export async function getUsuarios() {
  return listDocuments('usuarios', [orderBy('nome'), limit(100)])
}

export async function getNfseRascunhos(clienteId?: string) {
  const c: QueryConstraint[] = [orderBy('criadoEm', 'desc'), limit(50)]
  if (clienteId) c.push(where('clienteId', '==', clienteId))
  return listDocuments('nfse_rascunhos', c)
}

export async function getNfseEmitidas(clienteId?: string) {
  const c: QueryConstraint[] = [orderBy('dataEmissao', 'desc'), limit(50)]
  if (clienteId) c.push(where('clienteId', '==', clienteId))
  return listDocuments('nfse_emitidas', c)
}
