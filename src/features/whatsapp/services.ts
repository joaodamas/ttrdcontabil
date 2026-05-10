import { getFunctions, httpsCallable } from 'firebase/functions'
import { limit, where } from 'firebase/firestore'
import { getFirebaseApp } from '@/lib/firebase'
import { listDocuments } from '@/lib/firestore-client'
import type { WhatsappCampaignRule, WhatsappMessage, WhatsappTemplate } from './types'

const functions = () => getFunctions(getFirebaseApp(), 'southamerica-east1')

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
  const rows = await listDocuments<WhatsappMessage>('whatsapp_messages', [
    where('lancamentoId', '==', lancamentoId),
    limit(20),
  ])
  return rows.sort((a, b) => (b.criadoEm?.toMillis?.() ?? 0) - (a.criadoEm?.toMillis?.() ?? 0))
}

export async function fetchWhatsappRules() {
  const rows = await listDocuments<WhatsappCampaignRule>('whatsapp_campaign_rules', [limit(50)])
  return rows.sort((a, b) => Number(a.prioridade ?? 0) - Number(b.prioridade ?? 0))
}

export async function fetchWhatsappTemplates() {
  const rows = await listDocuments<WhatsappTemplate>('whatsapp_templates', [limit(50)])
  return rows.sort((a, b) => String(a.templateKey ?? '').localeCompare(String(b.templateKey ?? ''), 'pt-BR'))
}
