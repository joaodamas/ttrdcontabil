import type { Timestamp } from 'firebase/firestore'

export type ClienteRecord = Record<string, unknown> & {
  id: string
  razaoSocial?: string
  nomeFantasia?: string
  cpfCnpj?: string
  regimeTributario?: string
  cidade?: string
  uf?: string
  status?: string
  riscoInadimplencia?: boolean
  /** Dia do mês (1–31) para emissão mensal da NFS-e */
  diaEmissaoNFSe?: number
  whatsapp?: string
  whatsappFinanceiro?: string
  aceiteWhatsAppCobranca?: boolean
  aceiteWhatsAppCobrancaEm?: Timestamp
  aceiteWhatsAppCobrancaOrigem?: string
  responsavelFinanceiroNome?: string
  responsavelFinanceiroCargo?: string
  responsavelFinanceiroEmail?: string
  responsavelFinanceiroTelefone?: string
  responsavelFinanceiroWhatsapp?: string
  responsavelFinanceiroPreferencial?: boolean
  whatsappCobrancaPausado?: boolean
  whatsappCobrancaPausadoMotivo?: string
  whatsappCobrancaPausadoEm?: Timestamp
  whatsappCobrancaPausadoPor?: string
}

export type ClienteServicoRecord = Record<string, unknown> & {
  id: string
  clienteId: string
  servicoNome?: string
  valor?: number
  status?: string
  dataInicio?: Timestamp
}

export type CompetenciaRecord = Record<string, unknown> & {
  id: string
  clienteId: string
  mes: number
  ano: number
  status?: string
  servicoNome?: string
  updatedAt?: Timestamp
  createdAt?: Timestamp
}

export type LancamentoRecord = Record<string, unknown> & {
  id: string
  clienteId: string
  descricao?: string
  valor?: number
  status?: string
  dataVencimento?: Timestamp
  pagadorNome?: string
  pagadorWhatsapp?: string
  cobrancaWhatsappEnabled?: boolean
  statusWhatsappCobranca?: string
  ultimoEnvioWhatsappEm?: Timestamp
  proximaAcaoWhatsappEm?: Timestamp
  ultimaMensagemWhatsappId?: string
  etapaWhatsappAtual?: string
}

export type ClienteFiscalRecord = Record<string, unknown> & {
  id: string
  clienteId: string
  municipioIbge?: string
  inscricaoMunicipal?: string
  inscricaoEstadual?: string
  ambienteEmissao?: 'homologacao' | 'producao'
  regimeTributario?: string
  optanteSimples?: boolean
  incentivadorCultural?: boolean
  naturezaOperacao?: string
  itemListaServico?: string
  cnae?: string
  aliquotaPadrao?: number
  credenciais?: Record<string, unknown>
}

export type ClienteDetalheData = {
  cliente: ClienteRecord
  servicos: ClienteServicoRecord[]
  competencias: CompetenciaRecord[]
  lancamentos: LancamentoRecord[]
  fiscal: ClienteFiscalRecord | null
}
