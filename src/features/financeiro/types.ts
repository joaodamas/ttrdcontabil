import type { Timestamp } from 'firebase/firestore'
import type { FirestoreCursor } from '@/lib/firestore-client'

export type LancamentoRecord = Record<string, unknown> & {
  id: string
  clienteId?: string
  clienteNome?: string
  competenciaId?: string
  servicoId?: string
  clienteServicoId?: string
  tipo?: string
  status?: string
  descricao?: string
  valor?: number
  dataVencimento?: Timestamp
  dataPagamento?: Timestamp
  pagadorNome?: string
  pagadorWhatsapp?: string
  cobrancaWhatsappEnabled?: boolean
  statusWhatsappCobranca?: string
  ultimoEnvioWhatsappEm?: Timestamp
  proximaAcaoWhatsappEm?: Timestamp
  ultimaMensagemWhatsappId?: string
  etapaWhatsappAtual?: string
  whatsappCobrancaPausada?: boolean
  whatsappCobrancaPausadaMotivo?: string
  whatsappCobrancaIgnorada?: boolean
  whatsappCobrancaExigeAprovacao?: boolean
}

export type FinanceiroBaseFilters = {
  clienteId: string
  competenciaId: string
}

export type FinanceiroListFilters = FinanceiroBaseFilters & {
  tipo?: string
  status?: string
  page?: number
  pageSize?: number
  cursor?: FirestoreCursor | null
  cursorKey?: string
}

export type FinanceiroSnapshot = {
  allLancamentos: LancamentoRecord[]
  hasMore: boolean
  lastCursor: FirestoreCursor | null
  somaAReceber: number
  somaRecebidoMes: number
  somaEmAtraso: number
}
