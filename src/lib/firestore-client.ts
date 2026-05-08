/**
 * Client-side Firestore query helpers — used in 'use client' pages.
 * Replaces all server-side adminDb calls.
 */
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, Timestamp, documentId, setDoc,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { getClientDb, getClientAuth } from './firebase'

// ── Generic helpers ───────────────────────────────────────────────────────────

const AUDITED_COLLECTIONS = new Set([
  'clientes',
  'clientes_servicos',
  'competencias',
  'tarefas',
  'lancamentos',
  'cobrancas',
  'fechamentos',
  'fechamento_revisoes',
  'clientes_fiscal',
  'nfse_rascunhos',
  'nfse_emitidas',
  'ir_declaracoes',
  'ir_checklist',
  'usuarios',
  'configuracoes',
])

const TENANT_SCOPED_COLLECTIONS = new Set([
  'clientes',
  'clientes_servicos',
  'servicos',
  'competencias',
  'tarefas',
  'tarefas_comentarios',
  'lancamentos',
  'cobrancas',
  'fechamentos',
  'fechamento_revisoes',
  'clientes_fiscal',
  'clientes_fiscal_integracao',
  'fiscal_conectores',
  'nfse_rascunhos',
  'nfse_emitidas',
  'nfse_eventos',
  'nfse_fila_processamento',
  'events',
  'logs_auditoria',
  'dashboard_kpis',
  'documentos',
  'ir_declaracoes',
  'ir_checklist',
  'usuarios',
])

const SENSITIVE_KEYS = new Set([
  'senha',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'certificado',
  'certificadoBase64',
  'certificadoSenha',
  'senhaCertificado',
  'privateKey',
  'chavePrivada',
  'configJson',
  'credenciais',
  'payloadEnvio',
  'payloadRetorno',
  'respostaIntegracao',
])

const SENSITIVE_KEY_PARTS = [
  'senha',
  'password',
  'token',
  'credential',
  'credencial',
  'cert',
  'chave',
  'private',
  'secret',
]

let _actorCache: { uid: string; nome: string; email: string; tenantId?: string } | null = null

async function getAuditActor() {
  const authUser = getClientAuth().currentUser
  if (!authUser) return null
  if (_actorCache?.uid === authUser.uid) return _actorCache

  let nome = authUser.displayName ?? authUser.email ?? authUser.uid
  try {
    const snap = await getDoc(doc(getClientDb(), 'usuarios', authUser.uid))
    if (snap.exists()) {
      const data = snap.data()
      nome = (data.nome as string | undefined) ?? nome
      _actorCache = {
        uid: authUser.uid,
        nome,
        email: authUser.email ?? '',
        tenantId: data.tenantId as string | undefined,
      }
      return _actorCache
    }
  } catch {
    // Perfil indisponível não deve impedir o write principal.
  }

  _actorCache = {
    uid: authUser.uid,
    nome,
    email: authUser.email ?? '',
  }
  return _actorCache
}

function redactAuditData(value: unknown): unknown {
  if (value == null) return value
  if (value instanceof Timestamp) return value
  if (Array.isArray(value)) return value.map(redactAuditData)
  if (typeof value !== 'object') return value

  if ('toDate' in (value as Record<string, unknown>)) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(key) || SENSITIVE_KEY_PARTS.some((part) => key.toLowerCase().includes(part))
        ? '[REDACTED]'
        : redactAuditData(nested),
    ])
  )
}

async function writeAuditLog(params: {
  entidade: string
  entidadeId?: string
  acao: 'create' | 'update' | 'delete' | 'soft_delete'
  dadosAntes?: Record<string, unknown> | null
  dadosDepois?: Record<string, unknown> | null
}) {
  if (!AUDITED_COLLECTIONS.has(params.entidade)) return
  const actor = await getAuditActor()
  if (!actor) return

  await addDoc(collection(getClientDb(), 'logs_auditoria'), {
    usuarioId: actor.uid,
    usuarioNome: actor.nome,
    usuarioEmail: actor.email,
    entidade: params.entidade,
    entidadeId: params.entidadeId ?? null,
    acao: params.acao,
    dadosAntes: params.dadosAntes ? redactAuditData(params.dadosAntes) : null,
    dadosDepois: params.dadosDepois ? redactAuditData(params.dadosDepois) : null,
    origem: 'client',
    path: typeof window !== 'undefined' ? window.location.pathname : null,
    criadoEm: serverTimestamp(),
  })
}

async function auditSafely(params: Parameters<typeof writeAuditLog>[0]) {
  try {
    await writeAuditLog(params)
  } catch (err) {
    console.error('[audit] Falha ao registrar log de auditoria', err)
  }
}

function withActorMetadata(
  data: Record<string, unknown>,
  mode: 'create' | 'update',
  actor?: { uid: string; nome: string; tenantId?: string } | null
) {
  const user = getClientAuth().currentUser
  if (!user) return data
  const nome = actor?.nome ?? (_actorCache?.uid === user.uid ? _actorCache.nome : (user.displayName ?? user.email ?? user.uid))
  const actorFields = mode === 'create'
    ? { criadoPorId: user.uid, criadoPorNome: nome }
    : { atualizadoPorId: user.uid, atualizadoPorNome: nome }
  const tenant = actor?.tenantId && !('tenantId' in data) ? { tenantId: actor.tenantId } : {}
  return { ...data, ...actorFields, ...tenant }
}

export async function getDocument<T>(col: string, id: string): Promise<(T & { id: string }) | null> {
  if (TENANT_SCOPED_COLLECTIONS.has(col)) {
    // Use listDocuments so the tenantId filter is applied automatically,
    // matching the same security rules that allow list queries.
    const results = await listDocuments<T>(col, [where(documentId(), '==', id), limit(1)])
    return results[0] ?? null
  }
  const snap = await getDoc(doc(getClientDb(), col, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as T) }
}

export async function listDocuments<T>(
  col: string,
  constraints: QueryConstraint[] = []
): Promise<Array<T & { id: string }>> {
  const actor = TENANT_SCOPED_COLLECTIONS.has(col) ? await getAuditActor() : null
  const tenantConstraint = actor?.tenantId ? [where('tenantId', '==', actor.tenantId)] : []
  const q = query(collection(getClientDb(), col), ...tenantConstraint, ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))
}

export type FirestoreCursor = QueryDocumentSnapshot<DocumentData>

export async function listDocumentsPage<T>(
  col: string,
  constraints: QueryConstraint[] = [],
  cursor?: FirestoreCursor | null,
  pageSize = 20
): Promise<{
  rows: Array<T & { id: string }>
  lastCursor: FirestoreCursor | null
  cursors: FirestoreCursor[]
}> {
  const actor = TENANT_SCOPED_COLLECTIONS.has(col) ? await getAuditActor() : null
  const tenantConstraint = actor?.tenantId ? [where('tenantId', '==', actor.tenantId)] : []
  const cursorConstraint = cursor ? [startAfter(cursor)] : []
  const q = query(collection(getClientDb(), col), ...tenantConstraint, ...constraints, ...cursorConstraint, limit(pageSize))
  const snap = await getDocs(q)
  return {
    rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })),
    lastCursor: snap.docs.at(-1) ?? null,
    cursors: snap.docs,
  }
}

function stripUndefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
}

export async function createDocument(col: string, data: Record<string, unknown>) {
  const actor = await getAuditActor()
  const payload = withActorMetadata(stripUndefined(data), 'create', actor)
  const ref = await addDoc(
    collection(getClientDb(), col),
    { ...payload, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }
  )
  await auditSafely({
    entidade: col,
    entidadeId: ref.id,
    acao: 'create',
    dadosAntes: null,
    dadosDepois: payload,
  })
  return ref.id
}

export async function setDocument(col: string, id: string, data: Record<string, unknown>) {
  const ref = doc(getClientDb(), col, id)
  const beforeSnap = AUDITED_COLLECTIONS.has(col) ? await getDoc(ref).catch(() => null) : null
  if (beforeSnap?.exists()) {
    throw new Error(`Documento já existe em ${col}/${id}`)
  }
  const actor = await getAuditActor()
  const payload = withActorMetadata(stripUndefined(data), 'create', actor)
  await setDoc(ref, { ...payload, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() })
  await auditSafely({
    entidade: col,
    entidadeId: id,
    acao: 'create',
    dadosAntes: null,
    dadosDepois: payload,
  })
  return id
}

export async function updateDocument(col: string, id: string, data: Record<string, unknown>) {
  const ref = doc(getClientDb(), col, id)
  const beforeSnap = AUDITED_COLLECTIONS.has(col) ? await getDoc(ref).catch(() => null) : null
  const before = beforeSnap?.exists() ? beforeSnap.data() : null
  const actor = await getAuditActor()
  const payload = withActorMetadata(stripUndefined(data), 'update', actor)
  await updateDoc(
    ref,
    { ...payload, atualizadoEm: serverTimestamp() }
  )
  await auditSafely({
    entidade: col,
    entidadeId: id,
    acao: 'update',
    dadosAntes: before,
    dadosDepois: { ...(before ?? {}), ...payload },
  })
}

export async function deleteDocument(col: string, id: string) {
  const ref = doc(getClientDb(), col, id)
  const beforeSnap = AUDITED_COLLECTIONS.has(col) ? await getDoc(ref).catch(() => null) : null
  const before = beforeSnap?.exists() ? beforeSnap.data() : null
  await deleteDoc(ref)
  await auditSafely({
    entidade: col,
    entidadeId: id,
    acao: 'delete',
    dadosAntes: before,
    dadosDepois: null,
  })
}

/**
 * Soft-delete: marca o documento com deletedAt em vez de apagar fisicamente.
 * Usado exclusivamente para clientes — mantém integridade referencial.
 */
export async function softDeleteDocument(col: string, id: string) {
  const uid = getClientAuth().currentUser?.uid ?? null
  const ref = doc(getClientDb(), col, id)
  const beforeSnap = AUDITED_COLLECTIONS.has(col) ? await getDoc(ref).catch(() => null) : null
  const before = beforeSnap?.exists() ? beforeSnap.data() : null
  const actor = await getAuditActor()
  const payload = withActorMetadata({
    deletedAt:    serverTimestamp(),
    deletedById:  uid,
    atualizadoEm: serverTimestamp(),
  }, 'update', actor)
  await updateDoc(ref, payload)
  await auditSafely({
    entidade: col,
    entidadeId: id,
    acao: 'soft_delete',
    dadosAntes: before,
    dadosDepois: { ...(before ?? {}), deletedById: uid },
  })
}

// ── Domain queries ────────────────────────────────────────────────────────────

export async function getClientes(opts: { status?: string; limit?: number } = {}) {
  // Filtra e ordena client-side para evitar índices compostos extras com tenantId.
  const all = await listDocuments<Record<string, unknown>>('clientes', [limit(opts.limit ?? 500)])
  const ativos = all.filter((c) => !c.deletedAt) // exclui soft-deleted
  const filtered = opts.status ? ativos.filter((c) => c.status === opts.status) : ativos
  return filtered.sort((a, b) =>
    String(a.razaoSocial ?? a.nomeFantasia ?? a.id)
      .localeCompare(String(b.razaoSocial ?? b.nomeFantasia ?? b.id), 'pt-BR')
  )
}

export async function getCliente(id: string) {
  return getDocument('clientes', id)
}

export async function getClientesByIds(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (uniqueIds.length === 0) return [] as Array<Record<string, unknown> & { id: string }>

  const chunks: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += 10) chunks.push(uniqueIds.slice(i, i + 10))

  const batches = await Promise.all(
    chunks.map((chunk) =>
      listDocuments<Record<string, unknown>>('clientes', [where(documentId(), 'in', chunk), limit(500)])
    )
  )

  return batches.flat()
}

export async function getNextClienteCodigo(): Promise<number> {
  const rows = await listDocuments<{ codigo?: number }>('clientes', [orderBy('codigo', 'desc'), limit(1)])
  if (rows.length === 0) return 1
  return (rows[0].codigo ?? 0) + 1
}

export async function getServicos() {
  const data = await listDocuments('servicos', [limit(500)])
  return data.sort((a, b) =>
    String((a as Record<string, unknown>).nome ?? a.id)
      .localeCompare(String((b as Record<string, unknown>).nome ?? b.id), 'pt-BR')
  )
}

export async function getNextServicoCodigo(): Promise<string> {
  const rows = await listDocuments<{ codigoNumero?: number }>('servicos', [orderBy('codigoNumero', 'desc'), limit(1)])
  const next = rows.length === 0 ? 1 : (rows[0].codigoNumero ?? 0) + 1
  return `COB${String(next).padStart(2, '0')}`
}

export async function getClienteServicos(clienteId: string) {
  const rows = await listDocuments('clientes_servicos', [
    where('clienteId', '==', clienteId),
  ])
  return rows.sort((a, b) => {
    const aDate = (a as Record<string, { toMillis?: () => number } | unknown>).dataInicio
    const bDate = (b as Record<string, { toMillis?: () => number } | unknown>).dataInicio
    return ((bDate as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0) -
      ((aDate as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0)
  })
}

export async function getCompetencias(opts: { clienteId?: string; limit?: number } = {}) {
  // Filtra e ordena client-side para evitar indices compostos extras com tenantId.
  const all = await listDocuments<Record<string, unknown>>('competencias', [limit(opts.limit ?? 500)])
  const filtered = opts.clienteId ? all.filter((c) => c.clienteId === opts.clienteId) : all
  return filtered.sort((a, b) => {
    const anoDiff = Number(b.ano ?? 0) - Number(a.ano ?? 0)
    if (anoDiff !== 0) return anoDiff
    return Number(b.mes ?? 0) - Number(a.mes ?? 0)
  })
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
  const c: QueryConstraint[] = [orderBy('dataPrazo', 'asc')]
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
  c.push(limit(500))
  const results = await listDocuments<{ clienteCodigo?: number }>('fechamentos', c)
  return results.sort((a, b) => (a.clienteCodigo ?? 0) - (b.clienteCodigo ?? 0))
}

let _usuariosCache: Array<Record<string, unknown>> | null = null
let _usuariosCacheTs = 0
const USUARIOS_CACHE_TTL = 5 * 60 * 1000 // 5 min
const USUARIOS_CACHE_SESSION_KEY = 'ttrd:usuarios-cache-v1'

function readUsuariosSessionCache(now: number): Array<Record<string, unknown>> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(USUARIOS_CACHE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts?: number; data?: Array<Record<string, unknown>> }
    if (!parsed.ts || !Array.isArray(parsed.data)) return null
    if (now - parsed.ts >= USUARIOS_CACHE_TTL) return null
    _usuariosCacheTs = parsed.ts
    _usuariosCache = parsed.data
    return parsed.data
  } catch {
    return null
  }
}

function writeUsuariosSessionCache(now: number, data: Array<Record<string, unknown>>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      USUARIOS_CACHE_SESSION_KEY,
      JSON.stringify({ ts: now, data })
    )
  } catch {
    // ignore storage failures (quota/privacy mode)
  }
}

export async function getUsuarios() {
  const now = Date.now()
  if (_usuariosCache && now - _usuariosCacheTs < USUARIOS_CACHE_TTL) {
    return _usuariosCache
  }
  const fromSession = readUsuariosSessionCache(now)
  if (fromSession) return fromSession
  const data = await listDocuments('usuarios', [orderBy('nome'), limit(100)])
  _usuariosCache = data as Array<Record<string, unknown>>
  _usuariosCacheTs = now
  writeUsuariosSessionCache(now, _usuariosCache)
  return _usuariosCache
}

export function invalidateUsuariosCache() {
  _usuariosCache = null
  _usuariosCacheTs = 0
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(USUARIOS_CACHE_SESSION_KEY)
    } catch {
      // ignore
    }
  }
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

export type ClienteTimelineEvento = {
  id: string
  tipo: 'tarefa' | 'lancamento' | 'competencia' | 'fechamento' | 'nfse' | 'fiscal' | 'manual'
  titulo: string
  descricao?: string
  data: Timestamp
  severidade: 'baixa' | 'media' | 'alta'
  actorId?: string
  actorNome?: string
  actorAvatarUrl?: string
  href?: string
  origemColecao?: string
  origemId?: string
}

function toTs(value: unknown): Timestamp | null {
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    return value as Timestamp
  }
  return null
}

/** Garante nome de ator sempre preenchido na timeline (UI / auditoria legível). */
function nomeAtorOu(opcional: string | undefined, fallback: string): string {
  const t = opcional?.trim()
  return t && t.length > 0 ? t : fallback
}

export async function getClienteTimeline(clienteId: string, maxItems = 80): Promise<ClienteTimelineEvento[]> {
  const [events, tarefas, lancamentos, competencias, nfse] = await Promise.all([
    listDocuments<Record<string, unknown>>('events', [where('clienteId', '==', clienteId), limit(maxItems)]).catch(() => []),
    listDocuments<Record<string, unknown>>('tarefas', [where('clienteId', '==', clienteId), limit(maxItems)]).catch(() => []),
    listDocuments<Record<string, unknown>>('lancamentos', [where('clienteId', '==', clienteId), limit(maxItems)]).catch(() => []),
    listDocuments<Record<string, unknown>>('competencias', [where('clienteId', '==', clienteId), limit(maxItems)]).catch(() => []),
    listDocuments<Record<string, unknown>>('nfse_emitidas', [where('clienteId', '==', clienteId), limit(maxItems)]).catch(() => []),
  ])

  const mapped: ClienteTimelineEvento[] = [
    ...events.map((e) => {
      const md = e.metadata as Record<string, unknown> | undefined
      const actorNomeMeta = md?.actorNome as string | undefined
      const actorIdMeta = md?.actorId as string | undefined
      const actorAvMeta = md?.actorAvatarUrl as string | undefined
      return {
        id: `event:${e.id}`,
        tipo: (e.tipo as ClienteTimelineEvento['tipo']) ?? 'manual',
        titulo: (e.titulo as string) ?? 'Evento',
        descricao: e.descricao as string | undefined,
        data: (toTs(e.criadoEm) ?? Timestamp.now()),
        severidade: (md?.severidade as ClienteTimelineEvento['severidade']) ?? 'media',
        actorId: actorIdMeta ?? (e.actorId as string | undefined) ?? 'system',
        actorNome: nomeAtorOu(actorNomeMeta ?? (e.actorNome as string | undefined), 'Sistema'),
        actorAvatarUrl: actorAvMeta ?? (e.actorAvatarUrl as string | undefined),
        href: md?.href as string | undefined,
        origemColecao: (e.origemColecao as string) ?? 'events',
        origemId: (e.origemId as string) ?? e.id,
      }
    }),
    ...tarefas.map((t) => ({
      id: `tarefa:${t.id}`,
      tipo: 'tarefa' as const,
      titulo: `Tarefa: ${(t.titulo as string) ?? 'Sem título'}`,
      descricao: `Status: ${(t.status as string) ?? '—'} • Prioridade: ${(t.prioridade as string) ?? 'normal'}`,
      data: toTs(t.atualizadoEm) ?? toTs(t.criadoEm) ?? toTs(t.dataPrazo) ?? Timestamp.now(),
      severidade: ((t.prioridade === 'urgente' || t.prioridade === 'alta') ? 'alta' : 'media') as ClienteTimelineEvento['severidade'],
      actorId: (t.responsavelId as string | undefined) || undefined,
      actorNome: nomeAtorOu(t.responsavelNome as string | undefined, 'Sem responsável'),
      href: `/tarefas/${t.id}`,
      origemColecao: 'tarefas',
      origemId: t.id,
    })),
    ...lancamentos.map((l) => ({
      id: `lancamento:${l.id}`,
      tipo: 'lancamento' as const,
      titulo: `Lançamento: ${(l.descricao as string) ?? 'Sem descrição'}`,
      descricao: `Status: ${(l.status as string) ?? '—'} • Valor: ${String(l.valor ?? 0)}`,
      data: toTs(l.atualizadoEm) ?? toTs(l.dataVencimento) ?? toTs(l.criadoEm) ?? Timestamp.now(),
      severidade: (l.status === 'atrasado' ? 'alta' : 'media') as ClienteTimelineEvento['severidade'],
      actorId:
        (l.atualizadoPorId as string | undefined)
        || (l.criadoPorId as string | undefined)
        || undefined,
      actorNome: nomeAtorOu(
        (l.atualizadoPorNome as string | undefined) ?? (l.criadoPorNome as string | undefined),
        'Sistema'
      ),
      href: '/financeiro',
      origemColecao: 'lancamentos',
      origemId: l.id,
    })),
    ...competencias.map((c) => ({
      id: `competencia:${c.id}`,
      tipo: 'competencia' as const,
      titulo: `Competência: ${String(c.mes ?? '—')}/${String(c.ano ?? '—')}`,
      descricao: `Status: ${(c.status as string) ?? '—'}`,
      data: toTs(c.atualizadoEm) ?? toTs(c.criadoEm) ?? Timestamp.now(),
      severidade: (c.status === 'aberta' ? 'alta' : c.status === 'em_andamento' ? 'media' : 'baixa') as ClienteTimelineEvento['severidade'],
      actorId: (c.responsavelId as string | undefined) || undefined,
      actorNome: nomeAtorOu(c.responsavelNome as string | undefined, 'Sem responsável'),
      href: `/competencias/${c.id}`,
      origemColecao: 'competencias',
      origemId: c.id,
    })),
    ...nfse.map((n) => ({
      id: `nfse:${n.id}`,
      tipo: 'nfse' as const,
      titulo: `NFS-e: ${(n.numeroNfse as string) ?? 'Sem número'}`,
      descricao: `Status: ${(n.status as string) ?? '—'}`,
      data: toTs(n.dataEmissao) ?? toTs(n.atualizadoEm) ?? toTs(n.criadoEm) ?? Timestamp.now(),
      severidade: (n.status === 'rejeitada' || n.status === 'erro_integracao' ? 'alta' : 'media') as ClienteTimelineEvento['severidade'],
      actorId: (n.emitidoPorId as string | undefined) || undefined,
      actorNome: nomeAtorOu(n.emitidoPorNome as string | undefined, 'Sistema'),
      href: '/fiscal/historico',
      origemColecao: 'nfse_emitidas',
      origemId: n.id,
    })),
  ]

  return mapped
    .sort((a, b) => b.data.toMillis() - a.data.toMillis())
    .slice(0, maxItems)
}

type HojeTaskLike = {
  id: string
  titulo?: string
  status?: string
  prioridade?: string
  responsavelId?: string
  responsavelNome?: string
  clienteNome?: string
  dataPrazo?: Timestamp
}

type FechamentoBloqueioLike = {
  id: string
  clienteNome?: string
  dasStatus?: string
  esocialStatus?: string
  reinfStatus?: string
  fgtsStatus?: string
  mes?: number
  ano?: number
}

export async function getHojeCockpit(opts: { responsavelId?: string } = {}) {
  const hoje = new Date()
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0)
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59)
  const em7Dias = new Date(fimHoje)
  em7Dias.setDate(em7Dias.getDate() + 7)

  const inicioHojeTs = Timestamp.fromDate(inicioHoje)
  const fimHojeTs = Timestamp.fromDate(fimHoje)
  const em7DiasTs = Timestamp.fromDate(em7Dias)

  const tarefasBase: QueryConstraint[] = [
    where('status', 'in', ['pendente', 'em_andamento']),
    ...(opts.responsavelId ? [where('responsavelId', '==', opts.responsavelId)] : []),
    orderBy('dataPrazo', 'asc'),
    limit(300),
  ]

  const [tarefas, fechamentos] = await Promise.all([
    listDocuments<Record<string, unknown>>('tarefas', tarefasBase),
    listDocuments<Record<string, unknown>>(
      'fechamentos',
      [where('mes', '==', hoje.getMonth() + 1), where('ano', '==', hoje.getFullYear()), limit(500)]
    ),
  ])

  const atrasadas: HojeTaskLike[] = []
  const hojeList: HojeTaskLike[] = []
  const proximos7Dias: HojeTaskLike[] = []

  for (const t of tarefas as HojeTaskLike[]) {
    if (!t.dataPrazo) continue
    const prazo = t.dataPrazo
    if (prazo < inicioHojeTs) {
      atrasadas.push(t)
    } else if (prazo >= inicioHojeTs && prazo <= fimHojeTs) {
      hojeList.push(t)
    } else if (prazo > fimHojeTs && prazo <= em7DiasTs) {
      proximos7Dias.push(t)
    }
  }

  const bloqueiosFechamento: FechamentoBloqueioLike[] = (fechamentos as FechamentoBloqueioLike[]).filter((f) => {
    const status = [f.dasStatus, f.esocialStatus, f.reinfStatus, f.fgtsStatus]
    return status.some((s) => s === 'pendente' || s === 'parcial')
  })

  return {
    atrasadas,
    hoje: hojeList,
    proximos7Dias,
    bloqueiosFechamento,
  }
}
