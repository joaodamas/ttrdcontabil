import * as admin from 'firebase-admin'
import twilio from 'twilio'
import { onRequest, Request } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import {
  aplicarOptOutWhatsapp,
  findClienteByWhatsapp,
  isPedidoOptOut,
  normalizePhone,
  processWebhookStatus,
  registrarMensagemRecebida,
} from './core'
import { DEFAULT_TENANT_ID } from '../tenant'
import { redactAuditData } from '../audit'
import { twilioSecrets } from './secrets'

const db = () => admin.firestore()

/**
 * Valida a assinatura `X-Twilio-Signature` que a Twilio envia em cada POST do
 * webhook (HMAC-SHA1 sobre a URL completa + parâmetros do form, usando o Auth
 * Token da conta). Sem isso, qualquer um poderia forjar status/respostas de
 * mensagens.
 *
 * O segredo vem de `TWILIO_AUTH_TOKEN` (Secret Manager). Enquanto não
 * configurado, retornamos `false` (fail-closed): o webhook rejeita tudo até o
 * secret ser plugado.
 *
 * `req.protocol` pode reportar `http` mesmo em produção quando o Cloud Run
 * por trás das Functions não repassa o esquema original — por isso preferimos
 * `x-forwarded-proto` quando presente, já que a URL usada na assinatura da
 * Twilio precisa bater exatamente com a URL pública (https) configurada no
 * console da Twilio.
 */
function verifyTwilioSignature(req: Request, signatureHeader: string | undefined): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    logger.warn('[whatsapp/webhook] TWILIO_AUTH_TOKEN não configurado — rejeitando POST. Configure o Auth Token da Twilio para ativar o webhook.')
    return false
  }
  if (!signatureHeader) return false
  const protocol = (req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0].trim()
  const url = `${protocol}://${req.get('host')}${req.originalUrl}`
  return twilio.validateRequest(authToken, signatureHeader, url, (req.body ?? {}) as Record<string, string>)
}

export const webhookWhatsapp = onRequest(
  { region: 'southamerica-east1', cors: true, memory: '256MiB', timeoutSeconds: 120, secrets: twilioSecrets },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method_not_allowed')
      return
    }

    const signature = req.header('x-twilio-signature')
    if (!verifyTwilioSignature(req, signature)) {
      res.status(403).json({ ok: false, error: 'invalid_signature' })
      return
    }

    const body = (req.body ?? {}) as Record<string, string>

    // 'received' não é status de entrega e sim mensagem chegando: se caísse no
    // ramo de status, um "PARE" seria contabilizado como callback e perdido.
    const statusEntrega = String(body.MessageStatus ?? '')
    if (statusEntrega && statusEntrega !== 'received') {
      // Status callback: entrega/leitura/falha de uma mensagem que nós enviamos.
      const providerMessageId = String(body.MessageSid ?? '')
      if (!providerMessageId) {
        res.status(200).json({ ok: true })
        return
      }
      const eventType = String(body.MessageStatus)
      const dedupeKey = `${providerMessageId}_${eventType}`
      await db().collection('whatsapp_webhook_events').doc(dedupeKey).set({
        tenantId: DEFAULT_TENANT_ID,
        providerMessageId,
        eventType,
        payloadResumo: redactAuditData(body),
        receivedAt: FieldValue.serverTimestamp(),
        processedAt: FieldValue.serverTimestamp(),
        dedupeKey,
      }, { merge: true })
      await processWebhookStatus(providerMessageId, eventType, body)
      res.status(200).json({ ok: true })
      return
    }

    // Mensagem recebida (resposta do cliente).
    //
    // ARMADILHA: antes só passava daqui quem respondia com "citar" no app do
    // WhatsApp, porque o código exigia `OriginalRepliedMessageSid`. Uma resposta
    // comum — inclusive "PARE" — caía no early-return e DESAPARECIA. Sem
    // opt-out funcionando, o número dedicado é denunciado e bloqueado nas
    // primeiras semanas. Agora processamos toda mensagem: o SID da original
    // continua sendo usado quando existe, mas deixou de ser pré-requisito.
    const telefoneOrigem = normalizePhone(String(body.From ?? ''), 'webhook:From')
    const inboundSid = String(body.MessageSid ?? body.SmsMessageSid ?? '')
    const texto = String(body.Body ?? '')
    const respostaDe = String(body.OriginalRepliedMessageSid ?? '')

    if (!inboundSid && !telefoneOrigem) {
      logger.warn('[whatsapp/webhook] POST sem MessageStatus, MessageSid e From — nada a processar.')
      res.status(200).json({ ok: true })
      return
    }

    // Sem MessageSid não há como deduplicar; preferimos processar duas vezes a
    // perder um pedido de opt-out (aplicar opt-out é idempotente).
    const dedupeKey = inboundSid ? `${inboundSid}_inbound` : `${telefoneOrigem}_${Date.now()}_inbound`
    const eventRef = db().collection('whatsapp_webhook_events').doc(dedupeKey)
    const jaProcessado = (await eventRef.get()).exists
    await eventRef.set({
      tenantId: DEFAULT_TENANT_ID,
      providerMessageId: respostaDe || inboundSid,
      eventType: 'inbound',
      payloadResumo: redactAuditData(body),
      receivedAt: FieldValue.serverTimestamp(),
      processedAt: FieldValue.serverTimestamp(),
      dedupeKey,
    }, { merge: true })

    // A Twilio reenvia o POST quando não recebe 200 a tempo.
    if (jaProcessado) {
      res.status(200).json({ ok: true })
      return
    }

    const optOut = isPedidoOptOut(texto)
    const cliente = telefoneOrigem ? await findClienteByWhatsapp(telefoneOrigem, DEFAULT_TENANT_ID) : null

    await registrarMensagemRecebida({
      tenantId: DEFAULT_TENANT_ID,
      clienteId: cliente?.id ?? null,
      telefone: telefoneOrigem,
      texto,
      providerMessageId: inboundSid || null,
      respostaDe: respostaDe || null,
      optOut,
    })

    if (optOut) {
      const { jobsCancelados } = await aplicarOptOutWhatsapp({
        tenantId: DEFAULT_TENANT_ID,
        telefone: telefoneOrigem,
        clienteId: cliente?.id ?? null,
        texto,
        providerMessageId: inboundSid || null,
      })
      // Sem o número no log: é dado pessoal e o registro já está no Firestore.
      logger.warn('[whatsapp/webhook] opt-out aplicado', { clienteIdentificado: Boolean(cliente), jobsCancelados })
    }

    // Quando a resposta foi "citada", ainda dá para marcar a cobrança original
    // como respondida no histórico do lançamento.
    if (respostaDe) await processWebhookStatus(respostaDe, 'response', body)

    res.status(200).json({ ok: true })
  }
)
