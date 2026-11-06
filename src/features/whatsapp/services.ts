import { getFunctions, httpsCallable } from 'firebase/functions'
import { limit, where } from 'firebase/firestore'
import { getFirebaseApp } from '@/lib/firebase'
import { listDocuments } from '@/lib/firestore-client'
import { WHATSAPP_HABILITADO } from '@/lib/features'
import type { WhatsappCampaignRule, WhatsappMessage, WhatsappTemplate } from './types'

export const MENSAGEM_WHATSAPP_DESLIGADO = 'A cobrança por WhatsApp está desligada neste escritório.'

// Com o módulo desligado os callables não existem no servidor: falha aqui, com
// mensagem clara, em vez de um "internal"/"not-found" do Firebase. As telas já
// escondem as ações (WHATSAPP_HABILITADO); isto é a segunda trava.
const functions = () => {
  if (!WHATSAPP_HABILITADO) throw new Error(MENSAGEM_WHATSAPP_DESLIGADO)
  return getFunctions(getFirebaseApp(), 'southamerica-east1')
}

export async function sendWhatsappNow(lancamentoId: string) {
  const fn = httpsCallable<{ lancamentoId: string }, { messageId?: string; status: string }>(
    functions(),
    'dispararCobrancaWhatsappAgora'
  )
  return (await fn({ lancamentoId })).data
}

export async function pauseWhatsappRuleForLancamento(lancamentoId: string, motivo: string) {
  const fn = httpsCallable<{ lancamentoId: string; motivo?: string }, { status: string }>(
    functions(),
    'pausarCobrancaWhatsappLancamento'
  )
  return (await fn({ lancamentoId, motivo })).data
}

export async function resumeWhatsappRuleForLancamento(lancamentoId: string) {
  const fn = httpsCallable<{ lancamentoId: string }, { status: string }>(
    functions(),
    'retomarCobrancaWhatsappLancamento'
  )
  return (await fn({ lancamentoId })).data
}

export async function rescheduleWhatsappRuleForLancamento(lancamentoId: string) {
  const fn = httpsCallable<{ lancamentoId: string }, { status: string }>(
    functions(),
    'reagendarCobrancaWhatsappLancamento'
  )
  return (await fn({ lancamentoId })).data
}

export async function fetchWhatsappHistory(lancamentoId: string) {
  if (!WHATSAPP_HABILITADO) return []
  const rows = await listDocuments<WhatsappMessage>('whatsapp_messages', [
    where('lancamentoId', '==', lancamentoId),
    limit(20),
  ])
  return rows.sort((a, b) => (b.criadoEm?.toMillis?.() ?? 0) - (a.criadoEm?.toMillis?.() ?? 0))
}

export async function fetchWhatsappRules() {
  if (!WHATSAPP_HABILITADO) return []
  const rows = await listDocuments<WhatsappCampaignRule>('whatsapp_campaign_rules', [limit(50)])
  return rows.sort((a, b) => Number(a.prioridade ?? 0) - Number(b.prioridade ?? 0))
}

export async function fetchWhatsappTemplates() {
  if (!WHATSAPP_HABILITADO) return []
  const rows = await listDocuments<WhatsappTemplate>('whatsapp_templates', [limit(50)])
  return rows.sort((a, b) => String(a.templateKey ?? '').localeCompare(String(b.templateKey ?? ''), 'pt-BR'))
}

export async function updateWhatsappTemplate(input: {
  templateKey: string
  providerContentSid?: string
  ativo?: boolean
  aprovadoProvider?: boolean
}) {
  const fn = httpsCallable<typeof input, { status: string }>(functions(), 'atualizarTemplateWhatsapp')
  return (await fn(input)).data
}
