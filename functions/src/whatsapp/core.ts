import * as admin from 'firebase-admin'
import axios from 'axios'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { redactAuditData, SYSTEM_ACTOR, writeAuditLog } from '../audit'
import { DEFAULT_TENANT_ID } from '../tenant'
import type { ClienteWhatsappTarget, EligibilityResult, LancamentoDoc, WhatsappCampaignRule, WhatsappTenantConfig } from './types'

const db = () => admin.firestore()

const DEFAULT_RULES: Array<Omit<WhatsappCampaignRule, 'tenantId'>> = [
  { ativo: true, etapa: 'D-7', diasAntes: 7, templateKey: 'cobranca_pre_vencimento_7', usarDiasUteis: true, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 10 },
  { ativo: true, etapa: 'D-3', diasAntes: 3, templateKey: 'cobranca_pre_vencimento_3', usarDiasUteis: true, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 20 },
  { ativo: true, etapa: 'D0', diasDepois: 0, templateKey: 'cobranca_vencimento_hoje', usarDiasUteis: false, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 30 },
  { ativo: true, etapa: 'D+3', diasDepois: 3, templateKey: 'cobranca_atraso_leve', usarDiasUteis: false, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 40 },
  { ativo: true, etapa: 'D+7', diasDepois: 7, templateKey: 'cobranca_atraso_critico', usarDiasUteis: false, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: true, prioridade: 50 },
]

const DEFAULT_TEMPLATES = [
  { templateKey: 'cobranca_pre_vencimento_7', providerTemplateName: 'cobranca_pre_vencimento_7', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_pre_vencimento_3', providerTemplateName: 'cobranca_pre_vencimento_3', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_vencimento_hoje', providerTemplateName: 'cobranca_vencimento_hoje', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_atraso_leve', providerTemplateName: 'cobranca_atraso_leve', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_atraso_critico', providerTemplateName: 'cobranca_atraso_critico', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_baixa_confirmada', providerTemplateName: 'cobranca_baixa_confirmada', providerLanguage: 'pt_BR', categoria: 'utility' },
]

function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function combineDateAndTime(base: Date, timeHHmm: string | undefined) {
  const [hours, minutes] = String(timeHHmm || '08:00').split(':').map((part) => Number(part) || 0)
  const next = new Date(base)
  next.setHours(hours, minutes, 0, 0)
  return next
}

function differenceInCalendarDays(a: Date, b: Date) {
  const left = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const right = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((left - right) / 86400000)
}

export async function ensureWhatsappDefaults(tenantId = DEFAULT_TENANT_ID) {
  const batch = db().batch()
  for (const rule of DEFAULT_RULES) {
    const ref = db().collection('whatsapp_campaign_rules').doc(`${tenantId}_${rule.etapa}`)
    batch.set(ref, { tenantId, ...rule, canal: 'whatsapp', atualizadoEm: FieldValue.serverTimestamp(), criadoEm: FieldValue.serverTimestamp() }, { merge: true })
  }
  for (const template of DEFAULT_TEMPLATES) {
    const ref = db().collection('whatsapp_templates').doc(`${tenantId}_${template.templateKey}`)
    batch.set(ref, {
      tenantId,
      ...template,
      ativo: true,
      variaveisEsperadas: ['nome_cliente', 'servico', 'valor', 'vencimento'],
      canal: 'whatsapp',
      aprovadoProvider: false,
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  await batch.commit()
}

export async function getTenantWhatsappConfig(tenantId: string): Promise<WhatsappTenantConfig> {
  const snap = await db().collection('configuracoes').doc('escritorio').get()
  const data = snap.data() ?? {}
  return {
    tenantId,
    whatsappCloudApiEnabled: Boolean(data.whatsappCloudApiEnabled),
    whatsappBusinessAccountId: data.whatsappBusinessAccountId as string | undefined,
    whatsappPhoneNumberId: data.whatsappPhoneNumberId as string | undefined,
    whatsappWebhookVerifyToken: data.whatsappWebhookVerifyToken as string | undefined,
    whatsappJanelaHoraMinima: data.whatsappJanelaHoraMinima as string | undefined,
    whatsappJanelaHoraMaxima: data.whatsappJanelaHoraMaxima as string | undefined,
    whatsappUsaDiasUteis: Boolean(data.whatsappUsaDiasUteis ?? true),
  }
}

export async function getWhatsappRules(tenantId: string) {
  const snap = await db()
    .collection('whatsapp_campaign_rules')
    .where('tenantId', '==', tenantId)
    .get()

  if (snap.empty) {
    await ensureWhatsappDefaults(tenantId)
    return getWhatsappRules(tenantId)
  }

  return snap.docs
    .map((doc) => doc.data() as WhatsappCampaignRule)
    .filter((rule) => rule.ativo)
    .sort((a, b) => Number(a.prioridade ?? 0) - Number(b.prioridade ?? 0))
}

export async function resolveBillingTarget(clienteId: string): Promise<ClienteWhatsappTarget | null> {
  const snap = await db().collection('clientes').doc(clienteId).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  const financeiroWhatsapp = normalizePhone(data.responsavelFinanceiroWhatsapp)
  const whatsappFinanceiro = normalizePhone(data.whatsappFinanceiro)
  const whatsappPrincipal = normalizePhone(data.whatsapp)

  if (data.responsavelFinanceiroPreferencial && financeiroWhatsapp) {
    return {
      clienteId,
      contatoNome: (data.responsavelFinanceiroNome as string | undefined) ?? (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: financeiroWhatsapp,
      contatoOrigem: 'responsavel_financeiro',
    }
  }
  if (financeiroWhatsapp) {
    return {
      clienteId,
      contatoNome: (data.responsavelFinanceiroNome as string | undefined) ?? (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: financeiroWhatsapp,
      contatoOrigem: 'responsavel_financeiro',
    }
  }
  if (whatsappFinanceiro) {
    return {
      clienteId,
      contatoNome: (data.responsavelFinanceiroNome as string | undefined) ?? (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: whatsappFinanceiro,
      contatoOrigem: 'whatsapp_financeiro',
    }
  }
  if (whatsappPrincipal) {
    return {
      clienteId,
      contatoNome: (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: whatsappPrincipal,
      contatoOrigem: 'cliente',
    }
  }
  return null
}

export async function evaluateLancamentoEligibility(
  lancamentoId: string,
  opts?: { manual?: boolean }
): Promise<EligibilityResult> {
  const lancamentoSnap = await db().collection('lancamentos').doc(lancamentoId).get()
  if (!lancamentoSnap.exists) return { eligible: false, reason: 'Lançamento não encontrado.' }
  const lancamento = { id: lancamentoSnap.id, ...(lancamentoSnap.data() ?? {}) } as LancamentoDoc

  if (!lancamento.clienteId) return { eligible: false, reason: 'Lançamento sem cliente vinculado.' }
  if (lancamento.tipo !== 'receita') return { eligible: false, reason: 'Somente receitas entram na régua.' }
  if (!['pendente', 'atrasado'].includes(String(lancamento.status ?? ''))) return { eligible: false, reason: 'Status financeiro inelegível.' }
  if (lancamento.cobrancaWhatsappEnabled === false || lancamento.whatsappCobrancaIgnorada) {
    return { eligible: false, reason: 'Cobrança WhatsApp desativada para este lançamento.' }
  }
  if (lancamento.whatsappCobrancaPausada) return { eligible: false, reason: 'Régua pausada manualmente.' }
  if (lancamento.dataPagamento) return { eligible: false, reason: 'Lançamento já pago.' }

  const clienteSnap = await db().collection('clientes').doc(lancamento.clienteId).get()
  if (!clienteSnap.exists) return { eligible: false, reason: 'Cliente não encontrado.' }
  const cliente = clienteSnap.data() ?? {}
  if (cliente.status !== 'ativo') return { eligible: false, reason: 'Cliente inativo.' }
  if (!cliente.aceiteWhatsAppCobranca) return { eligible: false, reason: 'Cliente sem consentimento para cobrança via WhatsApp.' }
  if (cliente.whatsappCobrancaPausado) return { eligible: false, reason: 'Cobrança pausada no cadastro do cliente.' }

  const target = await resolveBillingTarget(lancamento.clienteId)
  if (!target) return { eligible: false, reason: 'Cliente sem WhatsApp financeiro válido.' }

  const rules = await getWhatsappRules(String(cliente.tenantId ?? DEFAULT_TENANT_ID))
  const vencimento = lancamento.dataVencimento?.toDate()
  if (!vencimento) return { eligible: false, reason: 'Lançamento sem vencimento.' }

  const baseDate = new Date()
  const dayDiff = differenceInCalendarDays(baseDate, vencimento)
  const matchedRule = opts?.manual
    ? rules[0]
    : rules.find((rule) => {
        if (typeof rule.diasAntes === 'number') return dayDiff === -rule.diasAntes
        if (typeof rule.diasDepois === 'number') return dayDiff === rule.diasDepois
        return false
      })

  if (!matchedRule) return { eligible: false, reason: 'Nenhuma etapa da régua ativa para esta data.' }

  const existingJobKey = buildJobKey(lancamento.id ?? lancamentoId, matchedRule.etapa, baseDate)
  const existingJob = await db().collection('whatsapp_jobs').doc(existingJobKey).get()
  if (existingJob.exists && !opts?.manual) return { eligible: false, reason: 'Job já criado para esta etapa/base.' }

  const config = await getTenantWhatsappConfig(String(cliente.tenantId ?? DEFAULT_TENANT_ID))
  const scheduledFor = combineDateAndTime(baseDate, matchedRule.horaMinima || config.whatsappJanelaHoraMinima)
  return { eligible: true, target, rule: matchedRule, etapa: matchedRule.etapa, scheduledFor }
}

export function buildJobKey(lancamentoId: string, etapa: string, dateBase: Date) {
  const base = `${dateBase.getFullYear()}${String(dateBase.getMonth() + 1).padStart(2, '0')}${String(dateBase.getDate()).padStart(2, '0')}`
  return `${lancamentoId}_${etapa}_${base}`
}

export async function queueWhatsappJob(lancamentoId: string, opts?: { manual?: boolean }) {
  const eligibility = await evaluateLancamentoEligibility(lancamentoId, opts)
  if (!eligibility.eligible || !eligibility.target || !eligibility.rule || !eligibility.etapa || !eligibility.scheduledFor) {
    throw new HttpsError('failed-precondition', eligibility.reason ?? 'Lançamento inelegível.')
  }

  const lancamentoSnap = await db().collection('lancamentos').doc(lancamentoId).get()
  const lancamento = lancamentoSnap.data() as LancamentoDoc | undefined
  if (!lancamento?.clienteId) throw new HttpsError('failed-precondition', 'Lançamento sem cliente.')

  const clienteSnap = await db().collection('clientes').doc(lancamento.clienteId).get()
  const tenantId = String(clienteSnap.data()?.tenantId ?? DEFAULT_TENANT_ID)
  const jobKey = buildJobKey(lancamentoId, eligibility.etapa, eligibility.scheduledFor)
  const payloadResumo = {
    clienteNome: clienteSnap.data()?.razaoSocial ?? lancamento.clienteNome ?? '',
    servico: lancamento.descricao ?? 'Mensalidade',
    valor: Number(lancamento.valor ?? 0).toFixed(2),
    vencimento: lancamento.dataVencimento?.toDate().toLocaleDateString('pt-BR'),
  }

  await db().collection('whatsapp_jobs').doc(jobKey).set({
    tenantId,
    jobKey,
    clienteId: lancamento.clienteId,
    lancamentoId,
    messageId: null,
    etapa: eligibility.etapa,
    status: 'agendado',
    scheduledFor: admin.firestore.Timestamp.fromDate(eligibility.scheduledFor),
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    erro: null,
    detalhes: null,
    contatoDestino: eligibility.target.contatoTelefone,
    payloadResumo,
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db().collection('lancamentos').doc(lancamentoId).set({
    statusWhatsappCobranca: 'agendado',
    proximaAcaoWhatsappEm: admin.firestore.Timestamp.fromDate(eligibility.scheduledFor),
    etapaWhatsappAtual: eligibility.etapa,
    pagadorNome: lancamento.pagadorNome ?? eligibility.target.contatoNome,
    pagadorWhatsapp: lancamento.pagadorWhatsapp ?? eligibility.target.contatoTelefone,
    cobrancaWhatsappEnabled: true,
    whatsappCobrancaExigeAprovacao: eligibility.rule.exigeAprovacao,
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  return { jobKey, etapa: eligibility.etapa, scheduledFor: eligibility.scheduledFor }
}

async function buildMessagePayload(job: FirebaseFirestore.DocumentData) {
  const templateSnap = await db()
    .collection('whatsapp_templates')
    .where('tenantId', '==', job.tenantId)
    .get()
  const templateKey = mapEtapaToTemplate(String(job.etapa))
  const template = templateSnap.docs
    .map((doc) => doc.data())
    .find((doc) => doc.templateKey === templateKey) ?? {}

  return {
    messaging_product: 'whatsapp',
    to: String(job.contatoDestino),
    type: 'template',
    template: {
      name: String(template.providerTemplateName ?? templateKey),
      language: { code: String(template.providerLanguage ?? 'pt_BR') },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(job.payloadResumo?.clienteNome ?? '') },
            { type: 'text', text: String(job.payloadResumo?.servico ?? '') },
            { type: 'text', text: String(job.payloadResumo?.valor ?? '') },
            { type: 'text', text: String(job.payloadResumo?.vencimento ?? '') },
          ],
        },
      ],
    },
  }
}

function mapEtapaToTemplate(etapa: string) {
  switch (etapa) {
    case 'D-7': return 'cobranca_pre_vencimento_7'
    case 'D-3': return 'cobranca_pre_vencimento_3'
    case 'D0': return 'cobranca_vencimento_hoje'
    case 'D+3': return 'cobranca_atraso_leve'
    case 'D+7': return 'cobranca_atraso_critico'
    default: return 'cobranca_pre_vencimento_3'
  }
}

export async function dispatchWhatsappJob(jobId: string) {
  const jobSnap = await db().collection('whatsapp_jobs').doc(jobId).get()
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job não encontrado.')
  const job = jobSnap.data() ?? {}

  // Todo o caminho de dispatch (pré-condições, montagem e envio) fica dentro do
  // try para que QUALQUER falha — inclusive Cloud API desabilitada ou token/phone
  // ausente — seja registrada com nextRetryAt/attemptCount e progrida até
  // 'esgotado' na fila, em vez de virar um job 'falhou' preso sem retry.
  try {
    const config = await getTenantWhatsappConfig(String(job.tenantId ?? DEFAULT_TENANT_ID))
    if (!config.whatsappCloudApiEnabled) {
      throw new HttpsError('failed-precondition', 'Cloud API de WhatsApp desabilitada nos parâmetros.')
    }

    const apiToken = process.env.WHATSAPP_CLOUD_API_TOKEN
    const phoneNumberId = config.whatsappPhoneNumberId
    if (!apiToken || !phoneNumberId) {
      throw new HttpsError('failed-precondition', 'Token ou phone number ID do WhatsApp não configurados.')
    }

    const messagePayload = await buildMessagePayload(job)
    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`

    const response = await axios.post(url, messagePayload, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    })
    const providerMessageId = response.data?.messages?.[0]?.id ?? null
    const messageRef = db().collection('whatsapp_messages').doc()

    await messageRef.set({
      tenantId: job.tenantId,
      clienteId: job.clienteId,
      lancamentoId: job.lancamentoId,
      jobId,
      templateKey: mapEtapaToTemplate(String(job.etapa)),
      etapa: job.etapa,
      status: 'enviado',
      providerMessageId,
      payloadResumo: redactAuditData(messagePayload),
      responseResumo: redactAuditData(response.data),
      erro: null,
      detalhes: null,
      contatoDestino: job.contatoDestino,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    })

    await db().collection('whatsapp_jobs').doc(jobId).set({
      status: 'enviado',
      messageId: messageRef.id,
      attemptCount: FieldValue.increment(1),
      lastAttemptAt: FieldValue.serverTimestamp(),
      erro: null,
      detalhes: null,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })

    await db().collection('lancamentos').doc(String(job.lancamentoId)).set({
      statusWhatsappCobranca: 'enviado',
      ultimoEnvioWhatsappEm: FieldValue.serverTimestamp(),
      ultimaMensagemWhatsappId: messageRef.id,
      etapaWhatsappAtual: job.etapa,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })

    await db().collection('events').add({
      tenantId: job.tenantId,
      clienteId: job.clienteId,
      tipo: 'whatsapp_cobranca_enviado',
      titulo: `Cobrança WhatsApp ${job.etapa}`,
      descricao: `Mensagem enviada para ${job.contatoDestino}.`,
      metadata: redactAuditData({ etapa: job.etapa, providerMessageId }),
      criadoEm: FieldValue.serverTimestamp(),
    })

    await writeAuditLog({
      tenantId: String(job.tenantId),
      actor: SYSTEM_ACTOR,
      entidade: 'whatsapp_messages',
      entidadeId: messageRef.id,
      acao: 'send',
      dadosAntes: null,
      dadosDepois: { jobId, etapa: job.etapa, contatoDestino: job.contatoDestino },
      origem: 'cloud_function',
    })

    return { messageId: messageRef.id, providerMessageId }
  } catch (error) {
    const axiosError = error as { response?: { data?: unknown; status?: number }; message?: string }
    const details = redactAuditData(axiosError.response?.data ?? axiosError.message ?? 'Erro desconhecido')
    await db().collection('whatsapp_jobs').doc(jobId).set({
      status: 'falhou',
      attemptCount: FieldValue.increment(1),
      lastAttemptAt: FieldValue.serverTimestamp(),
      nextRetryAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
      erro: axiosError.message ?? 'Falha ao enviar mensagem pelo provider.',
      detalhes: details,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (job.lancamentoId) {
      await db().collection('lancamentos').doc(String(job.lancamentoId)).set({
        statusWhatsappCobranca: 'falhou',
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    // Preserva o motivo real (ex.: pré-condição de config) em vez de mascarar tudo
    // como erro de provider — a fila registra nextRetryAt/attemptCount de qualquer forma.
    throw error instanceof HttpsError ? error : new HttpsError('internal', 'Falha ao enviar mensagem pelo provider.')
  }
}

export async function processWebhookStatus(providerMessageId: string, eventType: string, payload: unknown) {
  const snap = await db().collection('whatsapp_messages').where('providerMessageId', '==', providerMessageId).limit(1).get()
  if (snap.empty) return
  const messageRef = snap.docs[0].ref
  const message = snap.docs[0].data()
  const nextStatus =
    eventType === 'sent' ? 'enviado' :
    eventType === 'delivered' ? 'entregue' :
    eventType === 'read' ? 'lido' :
    eventType === 'failed' ? 'falhou' :
    eventType === 'response' ? 'respondido' :
    message.status

  await messageRef.set({
    status: nextStatus,
    responseResumo: redactAuditData(payload),
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  if (message.lancamentoId) {
    await db().collection('lancamentos').doc(String(message.lancamentoId)).set({
      statusWhatsappCobranca: nextStatus,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  await db().collection('events').add({
    tenantId: message.tenantId,
    clienteId: message.clienteId,
    tipo: `whatsapp_${eventType}`,
    titulo: `WhatsApp ${eventType}`,
    descricao: `Mensagem ${providerMessageId} atualizada para ${nextStatus}.`,
    metadata: redactAuditData(payload),
    criadoEm: FieldValue.serverTimestamp(),
  })
}
