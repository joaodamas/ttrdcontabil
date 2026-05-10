import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { processWebhookStatus, getTenantWhatsappConfig } from './core'
import { DEFAULT_TENANT_ID } from '../tenant'
import { redactAuditData } from '../audit'

const db = () => admin.firestore()

export const webhookWhatsapp = onRequest(
  { region: 'southamerica-east1', cors: true, memory: '256MiB', timeoutSeconds: 120 },
  async (req, res) => {
    const config = await getTenantWhatsappConfig(DEFAULT_TENANT_ID)

    if (req.method === 'GET') {
      const mode = req.query['hub.mode']
      const token = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']
      if (mode === 'subscribe' && token === config.whatsappWebhookVerifyToken) {
        res.status(200).send(challenge)
        return
      }
      res.status(403).send('forbidden')
      return
    }

    const body = req.body ?? {}
    const entry = Array.isArray(body.entry) ? body.entry[0] : null
    const change = entry?.changes?.[0]?.value
    const statuses = Array.isArray(change?.statuses) ? change.statuses : []
    const messages = Array.isArray(change?.messages) ? change.messages : []

    for (const status of statuses) {
      const providerMessageId = String(status.id ?? '')
      const eventType = String(status.status ?? 'unknown')
      const dedupeKey = `${providerMessageId}_${eventType}`
      await db().collection('whatsapp_webhook_events').doc(dedupeKey).set({
        tenantId: DEFAULT_TENANT_ID,
        providerMessageId,
        eventType,
        payloadResumo: redactAuditData(status),
        receivedAt: FieldValue.serverTimestamp(),
        processedAt: FieldValue.serverTimestamp(),
        dedupeKey,
      }, { merge: true })
      await processWebhookStatus(providerMessageId, eventType, status)
    }

    for (const message of messages) {
      const providerMessageId = String(message.context?.id ?? message.id ?? '')
      const dedupeKey = `${providerMessageId}_response`
      await db().collection('whatsapp_webhook_events').doc(dedupeKey).set({
        tenantId: DEFAULT_TENANT_ID,
        providerMessageId,
        eventType: 'response',
        payloadResumo: redactAuditData(message),
        receivedAt: FieldValue.serverTimestamp(),
        processedAt: FieldValue.serverTimestamp(),
        dedupeKey,
      }, { merge: true })
      if (providerMessageId) {
        await processWebhookStatus(providerMessageId, 'response', message)
      }
    }

    res.status(200).json({ ok: true })
  }
)
