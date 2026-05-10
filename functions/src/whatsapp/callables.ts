import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { assertCanAccessCliente } from '../authz'
import { DEFAULT_TENANT_ID } from '../tenant'
import { dispatchWhatsappJob, ensureWhatsappDefaults, queueWhatsappJob } from './core'

const db = () => admin.firestore()

async function getLancamentoOwnedByActor(uid: string, lancamentoId: string) {
  const snap = await db().collection('lancamentos').doc(lancamentoId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Lançamento não encontrado.')
  const data = snap.data() ?? {}
  await assertCanAccessCliente(uid, data.clienteId as string | undefined, 'financeiro')
  return { ref: snap.ref, data }
}

export const inicializarConfiguracaoWhatsapp = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  await ensureWhatsappDefaults(DEFAULT_TENANT_ID)
  return { status: 'ok' }
})

export const dispararCobrancaWhatsappAgora = onCall({ region: 'southamerica-east1' }, async (request) => {
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
