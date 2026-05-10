import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue } from 'firebase-admin/firestore'
import { DEFAULT_TENANT_ID } from '../tenant'
import { dispatchWhatsappJob, queueWhatsappJob } from './core'

const db = () => admin.firestore()

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

export const processarFilaWhatsapp = onSchedule(
  {
    schedule: '*/10 * * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const snap = await db()
      .collection('whatsapp_jobs')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .limit(50)
      .get()

    for (const doc of snap.docs) {
      const data = doc.data()
      const scheduledFor = data.scheduledFor?.toDate?.() as Date | undefined
      if (data.status !== 'agendado' || !scheduledFor || scheduledFor.getTime() > Date.now()) continue
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
  }
)
