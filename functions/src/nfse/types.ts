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
  // Opt-in explícito por cliente: quando true, o cron diário
  // (processarNfseRecorrenteDiaria) emite a NFS-e recorrente sem revisão
  // humana, no dia configurado em clientes.diaEmissaoNFSe. Default false —
  // decisão de reverter a trava "sem emissão automática" (ver
  // docs_dev/checklist-ajustes-producao.md) é por cliente, não global.
  emissaoAutomatica?: boolean
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

// ─── Carteira de tomadores e faturamento recorrente ──────────────────────────
// A NFS-e é emitida EM NOME DO CLIENTE do escritório: o prestador é o cliente,
// o tomador é o cliente DELE. `tomadores` é a carteira (fixa, na maioria dos
// casos) de cada prestador; `nfse_recorrentes` é o contrato de faturamento.
// NÃO CONFUNDIR com `clientes_servicos`, que é o honorário do ESCRITÓRIO e é
// consumido por scheduler/lancamentos.ts — foi essa confusão que fez o gerador
// de rascunhos preencher o tomador com o próprio prestador.

/**
 * Data do Firestore em forma estrutural, pelo mesmo motivo de
 * scheduler/recorrencia.ts: este arquivo é só tipo e não deve arrastar o
 * firebase-admin para dentro de um teste de unidade. É também o formato que
 * `vigenteNoMes()` já espera, então um NfseRecorrenteDoc entra nela direto.
 */
export type DataFirestore = { toDate(): Date }

export interface TomadorEnderecoDoc {
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string        // nome do município (exibição)
  /**
   * IBGE de 7 dígitos. OBRIGATÓRIO para emitir onde a prefeitura exige o
   * endereço do tomador — em municipios/cajamar.ts ele vira <Cidade> do tomador
   * e <MunicipioPrestacaoServico>. Opcional no tipo porque o cadastro pode
   * nascer sem endereço; quem cobra é a validação de emissão.
   */
  municipioIbge?: string
  uf?: string
}

/**
 * Documento da coleção `tomadores`.
 *
 * Superset do `Tomador` acima, de propósito: aquele é o PAYLOAD que vai para o
 * conector (só o que a prefeitura recebe), este é o CADASTRO. Converter um no
 * outro é responsabilidade de quem monta a emissão — manter os dois separados
 * evita que campo de tela (telefone, ativo, deletedAt) vaze para dentro do XML.
 */
export interface TomadorDoc {
  tenantId: string
  clienteId: string          // PRESTADOR: dono desta carteira
  cpfCnpj: string            // só dígitos
  razaoSocial: string
  email?: string
  telefone?: string
  inscricaoMunicipal?: string  // usado quando há retenção de ISS
  endereco?: TomadorEnderecoDoc
  ativo: boolean
  deletedAt?: DataFirestore
  criadoEm: DataFirestore
  atualizadoEm: DataFirestore
}

/**
 * Documento da coleção `nfse_recorrentes` — o contrato: quem fatura quem, de
 * quanto, em que dia.
 *
 * `dataInicio`/`dataFim` usam DataFirestore justamente para este tipo ser
 * aceito por `vigenteNoMes()` (scheduler/recorrencia.ts) sem conversão.
 */
export interface NfseRecorrenteDoc {
  tenantId: string
  clienteId: string          // PRESTADOR
  tomadorId: string          // doc em `tomadores`, da carteira deste clienteId
  // Denormalizados para o rascunho não precisar de join por contrato.
  tomadorNome: string
  tomadorCpfCnpj: string
  descricao: string          // vira a discriminação da nota
  valor: number
  diaEmissao: number         // 1–31; clampar ao tamanho do mês na geração
  // Vazios herdam de clientes_fiscal (codigoServicoPadrao / itemListaServico /
  // aliquotaPadrao) — preencher aqui é a exceção, não a regra.
  itemListaServico?: string
  codigoServico?: string
  aliquota?: number          // em % (ex.: 5.00)
  issRetido: boolean
  dataInicio: DataFirestore
  dataFim?: DataFirestore
  ativo: boolean
  criadoEm: DataFirestore
  atualizadoEm: DataFirestore
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

// ─── NF-e (produto) e NFC-e (consumidor) — Fase B ─────────────────────────────
// Fundação da emissão de MERCADORIA via Spedy. Importante: a Spedy TRANSMITE mas
// NÃO calcula imposto — CFOP/NCM/CST(ou CSOSN)/alíquotas vêm determinados daqui
// (preenchidos pelo contador no catálogo de produtos, que ainda será construído).
// MVP: operação interna, sem ST/DIFAL/IPI. Suporta Simples (CSOSN) e regime
// normal (CST). Nada disso emite ponta a ponta até existirem catálogo, tela e
// homologação na SEFAZ.
export interface ImpostoItem {
  cst?: string          // regime normal (Lucro Presumido/Real)
  csosn?: string        // Simples Nacional
  origem?: string       // 0–8, origem da mercadoria (usado no ICMS)
  baseCalculo?: number
  aliquota?: number     // em % (ex.: 18)
  valor?: number        // se ausente, a Spedy calcula a partir da alíquota
  // ICMS-ST (substituição tributária) — só ICMS. O contador informa; a Spedy
  // NÃO calcula MVA. Mapeiam p/ baseStRetentionAmount / stRetentionAmount.
  stBaseRetencao?: number
  stValorRetido?: number
}

export interface ItemProdutoFiscal {
  codigo: string
  descricao: string
  ncm: string
  cfop: string
  unidade: string       // ex.: "UN"
  quantidade: number
  valorUnitario: number
  icms: ImpostoItem     // origem obrigatória
  pis?: ImpostoItem
  cofins?: ImpostoItem
  ipi?: ImpostoItem     // indústria — nome do campo na Spedy a confirmar em homologação
}

// NF-e (modelo 55) — produto/mercadoria
export interface EmitirProdutoInput {
  clienteId: string
  rascunhoId?: string
  naturezaOperacao: string   // ex.: "Venda de mercadoria"
  destino?: 'internal' | 'interstate'  // default internal; a Spedy infere as UFs
  tomador: Tomador
  itens: ItemProdutoFiscal[]
  pagamentos?: { metodo: string; valor: number }[]
}

// NFC-e (modelo 65) — consumidor final. Tomador é opcional (venda anônima);
// sempre interna e presencial/online.
export interface EmitirConsumidorInput {
  clienteId: string
  rascunhoId?: string
  naturezaOperacao: string
  tomador?: Tomador
  presencial: boolean        // true = presence, false = internet
  itens: ItemProdutoFiscal[]
  pagamentos: { metodo: string; valor: number }[]
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
