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

function stripUndefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
}

export async function createDocument(col: string, data: Record<string, unknown>) {
  const ref = await addDoc(
    collection(db, col),
    { ...stripUndefined(data), criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }
  )
  return ref.id
}

export async function updateDocument(col: string, id: string, data: Record<string, unknown>) {
  await updateDoc(
    doc(db, col, id),
    { ...stripUndefined(data), atualizadoEm: serverTimestamp() }
  )
}

export async function deleteDocument(col: string, id: string) {
  await deleteDoc(doc(db, col, id))
}

// ── Domain queries ────────────────────────────────────────────────────────────

export async function getClientes(opts: { status?: string; limit?: number } = {}) {
  // Fetch all then filter client-side to avoid composite index requirement
  // (orderBy + where on different fields requires a deployed composite index)
  const all = await listDocuments<Record<string, unknown>>('clientes', [orderBy('razaoSocial'), limit(opts.limit ?? 500)])
  if (!opts.status) return all
  return all.filter((c) => c.status === opts.status)
}

export async function getCliente(id: string) {
  return getDocument('clientes', id)
}

export async function getNextClienteCodigo(): Promise<number> {
  const rows = await listDocuments<{ codigo?: number }>('clientes', [orderBy('codigo', 'desc'), limit(1)])
  if (rows.length === 0) return 1
  return (rows[0].codigo ?? 0) + 1
}

export async function getServicos() {
  return listDocuments('servicos', [orderBy('nome'), limit(500)])
}

export async function getNextServicoCodigo(): Promise<string> {
  const rows = await listDocuments<{ codigoNumero?: number }>('servicos', [orderBy('codigoNumero', 'desc'), limit(1)])
  const next = rows.length === 0 ? 1 : (rows[0].codigoNumero ?? 0) + 1
  return `COB${String(next).padStart(2, '0')}`
}

export async function getClienteServicos(clienteId: string) {
  return listDocuments('clientes_servicos', [
    where('clienteId', '==', clienteId),
    orderBy('dataInicio', 'desc'),
  ])
}

export async function getCompetencias(opts: { clienteId?: string; limit?: number } = {}) {
  // where() must come before orderBy() to match deployed composite index (clienteId, ano, mes)
  const c: QueryConstraint[] = []
  if (opts.clienteId) c.push(where('clienteId', '==', opts.clienteId))
  c.push(orderBy('ano', 'desc'), orderBy('mes', 'desc'))
  c.push(limit(opts.limit ?? 200))
  return listDocuments('competencias', c)
}

export async function getLancamentos(opts: { clienteId?: string; status?: string; limit?: number } = {}) {
  // where() must come before orderBy() to match deployed composite indexes
  const c: QueryConstraint[] = []
  if (opts.clienteId) c.push(where('clienteId', '==', opts.clienteId))
  if (opts.status)    c.push(where('status', '==', opts.status))
  c.push(orderBy('dataVencimento', 'desc'))
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
  // Use only equality filters (no orderBy) to avoid requiring composite indexes.
  // Sort client-side after fetching.
  const c: QueryConstraint[] = [
    where('mes', '==', mes),
    where('ano', '==', ano),
  ]
  if (regime) c.push(where('regime', '==', regime))
  const results = await listDocuments<{ clienteCodigo?: number }>('fechamentos', c)
  return results.sort((a, b) => (a.clienteCodigo ?? 0) - (b.clienteCodigo ?? 0))
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
