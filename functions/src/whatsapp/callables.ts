import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { assertCanAccessCliente } from '../authz'
import { DEFAULT_TENANT_ID, requireEnvironmentTenant } from '../tenant'
import { dispatchWhatsappJob, ensureWhatsappDefaults, queueWhatsappJob } from './core'
import { twilioSecrets } from './secrets'

const db = () => admin.firestore()

async function getLancamentoOwnedByActor(uid: string, lancamentoId: string) {
  const snap = await db().collection('lancamentos').doc(lancamentoId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Lançamento não encontrado.')
  const data = snap.data() ?? {}
  await assertCanAccessCliente(uid, data.clienteId as string | undefined, 'financeiro')
  return { ref: snap.ref, data }
}

async function assertAdminUser(uid: string) {
  const snap = await db().collection('usuarios').doc(uid).get()
  if (!snap.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const usuario = snap.data() ?? {}
  if (usuario.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')
  if (usuario.perfil !== 'admin') throw new HttpsError('permission-denied', 'Apenas administradores podem editar o catálogo de mensagens.')
  return { id: uid, tenantId: requireEnvironmentTenant(usuario.tenantId, 'Usuário') }
}

export const inicializarConfiguracaoWhatsapp = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  await ensureWhatsappDefaults(DEFAULT_TENANT_ID)
  return { status: 'ok' }
})

export const dispararCobrancaWhatsappAgora = onCall({ region: 'southamerica-east1', secrets: twilioSecrets }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const lancamentoId = String(request.data?.lancamentoId ?? '')
  const { data } = await getLancamentoOwnedByActor(uid, lancamentoId)
  const queued = await queueWhatsappJob(lancamentoId, { manual: true })
  const dispatched = await dispatchWhatsappJob(queued.jobKey)
  await db().collection('events').add({
    tenantId: String(data.tenantId ?? DEFAULT_TENANT_ID),
    clienteId: data.clienteId ?? null,
    tipo: 'whatsapp_cobranca_manual',
    titulo: 'Cobrança WhatsApp enviada manualmente',
    descricao: `Etapa ${queued.etapa} disparada manualmente.`,
    criadoEm: FieldValue.serverTimestamp(),
  })
  return { status: 'enviado', messageId: dispatched.messageId }
})

export const pausarCobrancaWhatsappLancamento = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const lancamentoId = String(request.data?.lancamentoId ?? '')
  const motivo = String(request.data?.motivo ?? 'Pausado manualmente')
  const { ref } = await getLancamentoOwnedByActor(uid, lancamentoId)
  await ref.set({
    whatsappCobrancaPausada: true,
    whatsappCobrancaPausadaMotivo: motivo,
    statusWhatsappCobranca: 'pausado',
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })
  return { status: 'pausado' }
})

export const retomarCobrancaWhatsappLancamento = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const lancamentoId = String(request.data?.lancamentoId ?? '')
  const { ref } = await getLancamentoOwnedByActor(uid, lancamentoId)
  await ref.set({
    whatsappCobrancaPausada: false,
    whatsappCobrancaPausadaMotivo: '',
    statusWhatsappCobranca: 'nao_agendado',
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })
  await queueWhatsappJob(lancamentoId, { manual: true })
  return { status: 'retomado' }
})

export const reagendarCobrancaWhatsappLancamento = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const lancamentoId = String(request.data?.lancamentoId ?? '')
  const { ref } = await getLancamentoOwnedByActor(uid, lancamentoId)
  await ref.set({
    statusWhatsappCobranca: 'nao_agendado',
    proximaAcaoWhatsappEm: null,
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })
  const queued = await queueWhatsappJob(lancamentoId, { manual: true })
  return { status: 'reagendado', jobKey: queued.jobKey }
})

export const atualizarTemplateWhatsapp = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const { tenantId } = await assertAdminUser(uid)

  const templateKey = String(request.data?.templateKey ?? '')
  if (!templateKey) throw new HttpsError('invalid-argument', 'templateKey obrigatório.')

  const docId = `${tenantId}_${templateKey}`
  const ref = db().collection('whatsapp_templates').doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Template não encontrado.')

  const updates: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp() }
  if (typeof request.data?.providerContentSid === 'string') updates.providerContentSid = request.data.providerContentSid.trim()
  if (typeof request.data?.ativo === 'boolean') updates.ativo = request.data.ativo
  if (typeof request.data?.aprovadoProvider === 'boolean') updates.aprovadoProvider = request.data.aprovadoProvider

  await ref.set(updates, { merge: true })
  return { status: 'ok' }
})
