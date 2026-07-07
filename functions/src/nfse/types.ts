// ─── Dados do emissor (prestador — cliente do TTRD) ──────────────────────────
export interface Prestador {
  cnpj: string               // somente dígitos
  inscricaoMunicipal: string
  razaoSocial: string
  municipioIbge: string      // código IBGE 7 dígitos
}

// ─── Dados do tomador (cliente do prestador) ─────────────────────────────────
export interface Tomador {
  cpfCnpj: string            // somente dígitos
  razaoSocial: string
  email?: string
  endereco?: {
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    municipioIbge?: string
    uf?: string
    cep?: string
  }
}

// ─── Dados do serviço ────────────────────────────────────────────────────────
export interface Servico {
  discriminacao: string      // descrição livre
  codigoServico: string      // código municipal (ex: "17.19")
  cnae?: string              // CNAE (ex: "6920601")
  itemListaServico?: string  // item lista de serviço LC116 (ex: "17.19")
  valorServico: number
  aliquota?: number          // ex: 5.00 (em %)
  issRetido: boolean
  valorDeducoes?: number
  valorPis?: number
  valorCofins?: number
  valorInss?: number
  valorIr?: number
  valorCsll?: number
  outrasRetencoes?: number
  descontoIncondicionado?: number
  descontoCondicionado?: number
  municipioPrestacao?: string // IBGE do local de prestação
}

// ─── Certificado digital ─────────────────────────────────────────────────────
export interface CertificadoA1 {
  pfxBase64: string          // .pfx codificado em base64
  senha: string
}

// ─── Configuração fiscal do cliente ──────────────────────────────────────────
export interface ConfigFiscalCliente {
  clienteId: string
  tenantId?: string
  municipioEmissor: string   // nome do município
  municipioIbge: string      // código IBGE 7 dígitos
  inscricaoMunicipal: string
  regimeTributario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei' | 'isento'
  optanteSimples: boolean
  incentivadorCultural: boolean
  codigoServicoPadrao?: string
  descricaoServicoPadrao?: string
  aliquotaPadrao?: number
  itemListaServico?: string
  cnae?: string
  naturezaOperacao?: string
  ambienteEmissao: 'producao' | 'homologacao'
  producaoLiberada?: boolean
  // 'spedy' delega a emissão a uma API agregadora (cobre qualquer município,
  // sem depender de conector caseiro); default 'municipio' preserva o
  // comportamento atual (conector direto por IBGE).
  provedorNfse?: 'municipio' | 'spedy'
  // Credenciais por municipio (salvas em Firestore — campo credenciais)
  credenciais?: CredenciaisConector
}

// ─── Credenciais (varia por provedor) ────────────────────────────────────────
export interface CredenciaisConector {
  // Para municípios que usam A1 (referencia ao Storage)
  certificadoStoragePath?: string  // ex: "certificados/clienteId.pfx"
  certificadoSenha?: string

  // Para municípios que usam token/login
  usuario?: string
  senha?: string
  token?: string

  // Santana de Parnaíba (SimplissWeb)
  simplissToken?: string

  // Taboão da Serra (Conam)
  conamCodigoUsuario?: string
  conamCodigoContribuinte?: string

  // Cotia (GIAP)
  giaplogin?: string
  giapSenha?: string

  // Spedy (provedorNfse === 'spedy') — chave de API por empresa
  spedyApiKey?: string
}

// ─── Payload de entrada da Cloud Function ────────────────────────────────────
export interface EmitirNfseInput {
  clienteId: string
  rascunhoId?: string          // se veio de rascunho salvo
  tomador: Tomador
  servico: Servico
  competenciaId?: string
  // Numero RPS gerado pelo sistema (se vazio, gera automaticamente)
  numeroRps?: string
  serieRps?: string
}

// ─── Resultado da emissão ─────────────────────────────────────────────────────
export interface ResultadoEmissao {
  sucesso: boolean
  numeroNfse?: string
  codigoVerificacao?: string
  xmlNfse?: string
  pdfUrl?: string
  erro?: string
  codigoErro?: string
  detalhes?: string
}

export interface ConsultarNfseInput {
  nfseId: string
  clienteId: string
  numeroNfse?: string
  codigoVerificacao?: string
  numeroRps?: string
  serieRps?: string
}

export interface CancelarNfseInput extends ConsultarNfseInput {
  motivo: string
}

export interface ResultadoOperacaoNfse {
  sucesso: boolean
  status?: 'emitida' | 'cancelada' | 'rejeitada' | 'processando' | 'erro'
  mensagem?: string
  numeroNfse?: string
  codigoVerificacao?: string
  xmlNfse?: string
  pdfUrl?: string
  erro?: string
  codigoErro?: string
  detalhes?: string
}

// ─── Mapa IBGE → Município ────────────────────────────────────────────────────
export const IBGE_MAP: Record<string, string> = {
  '3550308': 'São Paulo',
  '3509502': 'Campinas',
  '3525904': 'Jundiaí',
  '3505708': 'Barueri',
  '3508900': 'Cajamar',
  '3513009': 'Cotia',
  '3547304': 'Santana de Parnaíba',
  '3552502': 'Taboão da Serra',
}

// ─── Regime tributário → código ABRASF ────────────────────────────────────────
export const REGIME_CODIGO: Record<string, string> = {
  simples_nacional: '1',
  lucro_presumido:  '3',
  lucro_real:       '4',
  mei:              '1',
  isento:           '6',
}
