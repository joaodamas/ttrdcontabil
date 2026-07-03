import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue } from 'firebase-admin/firestore'
import { SYSTEM_ACTOR, writeAuditLog } from '../audit'
import { DEFAULT_TENANT_ID } from '../tenant'
import { dispatchWhatsappJob, queueWhatsappJob } from './core'

const db = () => admin.firestore()

/** Máximo de tentativas de envio antes de um job de cobrança WhatsApp ser dado como esgotado. */
const MAX_TENTATIVAS = 5

function toMillis(ts: FirebaseFirestore.Timestamp | undefined | null): number {
  return ts?.toDate?.().getTime() ?? 0
}

export const agendarCobrancasWhatsapp = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const snap = await db()
      .collection('lancamentos')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .limit(150)
      .get()

    for (const doc of snap.docs) {
      const data = doc.data()
      if (data.tipo !== 'receita' || !['pendente', 'atrasado'].includes(String(data.status ?? ''))) continue
      try {
        await queueWhatsappJob(doc.id)
      } catch {
        // Inelegível não deve interromper o lote.
      }
    }
  }
)

async function tentarDespacho(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  try {
    await dispatchWhatsappJob(doc.id)
  } catch (error) {
    await doc.ref.set({
      status: 'falhou',
      detalhes: String((error as Error)?.message ?? 'Falha ao processar fila.'),
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
}

async function marcarJobEsgotado(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data()
  const motivo = `Retentativas esgotadas (${MAX_TENTATIVAS}) para o job de cobrança WhatsApp.`

  await doc.ref.set({
    status: 'esgotado',
    detalhes: motivo,
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  const contexto = {
    jobId: doc.id,
    lancamentoId: data.lancamentoId ?? null,
    clienteId: data.clienteId ?? null,
    etapa: data.etapa ?? null,
    attemptCount: data.attemptCount ?? null,
    motivo,
  }
  console.error('[whatsapp][fila-esgotada]', JSON.stringify(contexto))

  await writeAuditLog({
    tenantId: String(data.tenantId ?? DEFAULT_TENANT_ID),
    actor: SYSTEM_ACTOR,
    entidade: 'whatsapp_jobs',
    entidadeId: doc.id,
    acao: 'esgotado',
    dadosAntes: null,
    dadosDepois: { ...contexto, severidade: 'alta' },
    origem: 'scheduler',
  })
}

export const processarFilaWhatsapp = onSchedule(
  {
    schedule: '*/10 * * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const agora = Date.now()

    // Duas queries por igualdade de status (sem orderBy) para não depender de
    // um índice composto novo em `whatsapp_jobs` — hoje só há índices de
    // campo único nessa coleção e este arquivo não pode alterar
    // firestore.indexes.json. A ordenação por data é feita em memória sobre
    // o resultado (já limitado a 50 por status).
    const [agendadosSnap, falhouSnap] = await Promise.all([
      db()
        .collection('whatsapp_jobs')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('status', '==', 'agendado')
        .limit(50)
        .get(),
      db()
        .collection('whatsapp_jobs')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('status', '==', 'falhou')
        .limit(50)
        .get(),
    ])

    const agendados = [...agendadosSnap.docs].sort(
      (a, b) => toMillis(a.data().scheduledFor) - toMillis(b.data().scheduledFor)
    )
    for (const doc of agendados) {
      const scheduledFor = doc.data().scheduledFor?.toDate?.() as Date | undefined
      if (!scheduledFor || scheduledFor.getTime() > agora) continue
      await tentarDespacho(doc)
    }

    const falhados = [...falhouSnap.docs].sort(
      (a, b) => toMillis(a.data().nextRetryAt) - toMillis(b.data().nextRetryAt)
    )
    for (const doc of falhados) {
      const data = doc.data()
      const attemptCount = Number(data.attemptCount ?? 0)

      if (attemptCount >= MAX_TENTATIVAS) {
        await marcarJobEsgotado(doc)
        continue
      }

      const nextRetryAt = data.nextRetryAt?.toDate?.() as Date | undefined
      if (!nextRetryAt || nextRetryAt.getTime() > agora) continue
      await tentarDespacho(doc)
    }
  }
)
