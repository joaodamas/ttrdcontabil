import type { Timestamp } from 'firebase/firestore'

export const WHATSAPP_STATUS_LABELS: Record<string, string> = {
  nao_agendado: 'Não agendado',
  agendado: 'Agendado',
  enviado: 'Enviado',
  entregue: 'Entregue',
  lido: 'Lido',
  respondido: 'Respondido',
  falhou: 'Falhou',
  pausado: 'Pausado',
}

export type WhatsappStatus =
  | 'nao_agendado'
  | 'agendado'
  | 'enviado'
  | 'entregue'
  | 'lido'
  | 'respondido'
  | 'falhou'
  | 'pausado'

export type WhatsappCampaignRule = {
  id: string
  tenantId?: string
  ativo?: boolean
  etapa?: string
  diasAntes?: number
  diasDepois?: number
  templateKey?: string
  usarDiasUteis?: boolean
  horaMinima?: string
  horaMaxima?: string
  exigeAprovacao?: boolean
  prioridade?: number
}

export type WhatsappTemplate = {
  id: string
  tenantId?: string
  templateKey?: string
  providerTemplateName?: string
  providerContentSid?: string
  providerLanguage?: string
  categoria?: string
  ativo?: boolean
  variaveisEsperadas?: string[]
  canal?: string
  aprovadoProvider?: boolean
}

export type WhatsappMessage = {
  id: string
  tenantId?: string
  clienteId?: string
  lancamentoId?: string
  jobId?: string
  templateKey?: string
  etapa?: string
  status?: WhatsappStatus | string
  providerMessageId?: string
  payloadResumo?: Record<string, unknown> | null
  responseResumo?: Record<string, unknown> | null
  erro?: string | null
  detalhes?: string | null
  contatoDestino?: string | null
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
}

export type WhatsappEscritorioConfig = {
  whatsappCloudApiEnabled: boolean
  whatsappTwilioFromNumber: string
  whatsappJanelaHoraMinima: string
  whatsappJanelaHoraMaxima: string
  whatsappUsaDiasUteis: boolean
}
