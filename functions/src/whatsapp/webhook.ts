import * as crypto from 'node:crypto'
import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { processWebhookStatus, getTenantWhatsappConfig } from './core'
import { DEFAULT_TENANT_ID } from '../tenant'
import { redactAuditData } from '../audit'

const db = () => admin.firestore()

/**
 * Valida a assinatura `X-Hub-Signature-256` que a Meta envia em cada POST do
 * webhook (HMAC-SHA256 do corpo cru usando o App Secret do app do Meta).
 * Sem isso, qualquer um poderia forjar status/respostas de mensagens.
 *
 * O segredo vem de `WHATSAPP_APP_SECRET` (env das Functions) — ainda NÃO
 * configurado enquanto o app do Meta Business não for criado. Enquanto o
 * segredo não existir, retornamos `false` (fail-closed): o webhook rejeita
 * tudo até o secret ser plugado. Não há tráfego real antes do setup do Meta.
 */
function verifyMetaSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    logger.warn('[whatsapp/webhook] WHATSAPP_APP_SECRET não configurado — rejeitando POST. Configure o App Secret do Meta para ativar o webhook.')
    return false
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !rawBody) {
    return false
  }
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = signatureHeader.slice('sha256='.length)
  // Comparação em tempo constante; buffers de tamanhos diferentes => false.
  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(received, 'hex')
  if (expectedBuf.length !== receivedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

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

    // POST: só processa eventos com assinatura válida da Meta.
    const signature = req.header('x-hub-signature-256')
    if (!verifyMetaSignature((req as { rawBody?: Buffer }).rawBody, signature)) {
      res.status(403).json({ ok: false, error: 'invalid_signature' })
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
