import type { DocumentData, Timestamp } from 'firebase-admin/firestore'

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
  tenantId: string
  ativo: boolean
  etapa: string
  diasAntes?: number
  diasDepois?: number
  templateKey: string
  usarDiasUteis: boolean
  horaMinima: string
  horaMaxima: string
  exigeAprovacao: boolean
  prioridade: number
}

export type WhatsappTenantConfig = {
  tenantId: string
  whatsappCloudApiEnabled: boolean
  whatsappTwilioFromNumber?: string
  whatsappJanelaHoraMinima?: string
  whatsappJanelaHoraMaxima?: string
  whatsappUsaDiasUteis?: boolean
}

export type ClienteWhatsappTarget = {
  clienteId: string
  contatoNome: string
  contatoTelefone: string
  contatoOrigem: string
}

export type EligibilityResult = {
  eligible: boolean
  reason?: string
  target?: ClienteWhatsappTarget
  rule?: WhatsappCampaignRule
  etapa?: string
  scheduledFor?: Date
}

export type LancamentoDoc = DocumentData & {
  id?: string
  clienteId?: string
  clienteNome?: string
  valor?: number
  tipo?: string
  status?: string
  descricao?: string
  dataVencimento?: Timestamp
  dataPagamento?: Timestamp
  pagadorNome?: string
  pagadorWhatsapp?: string
  cobrancaWhatsappEnabled?: boolean
  statusWhatsappCobranca?: WhatsappStatus
  ultimoEnvioWhatsappEm?: Timestamp
  proximaAcaoWhatsappEm?: Timestamp
  ultimaMensagemWhatsappId?: string
  etapaWhatsappAtual?: string
  whatsappCobrancaPausada?: boolean
  whatsappCobrancaPausadaMotivo?: string
  whatsappCobrancaIgnorada?: boolean
  whatsappCobrancaExigeAprovacao?: boolean
}
