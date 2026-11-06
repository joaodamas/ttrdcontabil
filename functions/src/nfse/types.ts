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
  // ── Só para o Ambiente Nacional (por nota; vazios herdam da config) ──
  /** cTribNac explícito (6 dígitos). Tem precedência sobre config.codigoTributacaoNacional e o item LC 116. */
  codigoTributacaoNacional?: string
  /** Código NBS (9 dígitos; aceita a forma pontuada "1.1501.10.00"). */
  codigoNbs?: string
  /** Informações complementares da nota (xInfComp). */
  informacoesComplementares?: string
  /** IBS/CBS da nota (vazios herdam da config): CST (3), cClassTrib (6), indicador de operação (6). */
  ibsCbsCst?: string
  ibsCbsClassTrib?: string
  ibsCbsIndOp?: string
  /**
   * Descrição com variáveis ({{MES_COMPETENCIA}}…) de onde `discriminacao` foi
   * renderada. Só é guardada em nfse_emitidas para a cópia da próxima nota —
   * o que vai para a DPS é sempre `discriminacao`, já renderada.
   */
  descricaoModelo?: string
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
  // Provedor de emissão: SÓ o Ambiente Nacional (decisão do dono — sem
  // integrador e sem conector de prefeitura desde 2026-11-06). Valores antigos
  // gravados ('municipio', 'prefeitura', 'spedy') são lidos como Nacional.
  provedorNfse?: ProvedorNfseGravado
  // ── Só para o Ambiente Nacional ──
  // cTribNac (6 dígitos) explícito. Sem ele, deriva do itemListaServico
  // (LC 116 "17.19" → "171901") — ver nacional/mapeamento.ts.
  codigoTributacaoNacional?: string
  // cTribMun (3 dígitos): desdobro municipal, só onde a prefeitura exige (E0312).
  codigoTributacaoMunicipal?: string
  // Série da DPS (1 a 5 dígitos, padrão "1"). Numeração em dps_sequencias.
  serieDps?: string
  // "Próximo número da DPS" informado por admin/fiscal (o cliente já emitiu
  // pelo Emissor Nacional web/app nesta série). Só o callable
  // definirNumeracaoDps grava (firestore.rules); vale como piso do contador
  // para a série/ambiente de numeracaoDpsAjuste (nacional/numeracao.ts).
  proximoNumeroDps?: number
  numeracaoDpsAjuste?: { serie: string; tpAmb: '1' | '2' } | null
  // Percentual aproximado dos tributos do Simples (pTotTribSN) para ME/EPP.
  // Sem ele, usa aliquotaPadrao (ver mapeamento.ts — premissa a confirmar).
  aliquotaSimplesNacional?: number
  // NBS padrão do cliente (a nota tem precedência).
  codigoNbs?: string
  // IBS/CBS padrão do cliente (tabelas oficiais em src/lib/nfse-dominios):
  // CST (3 dígitos), cClassTrib (6) e indicador de operação cIndOp (6).
  ibsCbsCst?: string
  ibsCbsClassTrib?: string
  ibsCbsIndOp?: string
  // Opt-in explícito por cliente: quando true, o cron diário
  // (processarNfseRecorrenteDiaria) emite a NFS-e recorrente sem revisão
  // humana, no dia configurado em clientes.diaEmissaoNFSe. Default false —
  // decisão de reverter a trava "sem emissão automática" (ver
  // docs_dev/checklist-ajustes-producao.md) é por cliente, não global.
  emissaoAutomatica?: boolean
  // Certificado A1 (gravado por uploadCertificado)
  credenciais?: CredenciaisConector
}

export type ProvedorNfse = 'nacional'
/**
 * Valor GRAVADO em clientes_fiscal.provedorNfse. Só 'nacional' é gravado hoje;
 * 'municipio', 'prefeitura' e 'spedy' existem em configs antigas e emitem pelo
 * Ambiente Nacional (o conector municipal e a Spedy saíram do código).
 */
export type ProvedorNfseGravado = ProvedorNfse | 'municipio' | 'prefeitura' | 'spedy'

// ─── Credenciais ─────────────────────────────────────────────────────────────
export interface CredenciaisConector {
  // Certificado A1 (arquivo cifrado no Storage — ver certificado.ts)
  certificadoStoragePath?: string  // "certificados/<clienteId>.pfx.b64"
  certificadoSenha?: string        // cifrada (encrypt.ts)
  certTitular?: string
  certVencimento?: string
  certValido?: boolean
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
   * IBGE de 7 dígitos (cMun do endereço do tomador na DPS nacional).
   * Opcional no tipo porque o cadastro pode nascer sem endereço; quem cobra
   * é a pré-validação (E0234/E1235).
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
  /** Competência da nota (AAAA-MM-DD). Preenchida a partir da competência vinculada; ver nacional/competencia.ts. */
  dataCompetencia?: string
  // Numero RPS gerado pelo sistema (se vazio, gera automaticamente)
  numeroRps?: string
  serieRps?: string
}

// ─── Resultado da emissão ─────────────────────────────────────────────────────
export interface ResultadoEmissao {
  sucesso: boolean
  numeroNfse?: string
  // Ambiente Nacional: recebe a chave de acesso (50 posições) — é ela que
  // consulta/cancela a nota; também vai em `chaveAcesso`.
  codigoVerificacao?: string
  chaveAcesso?: string
  idDps?: string
  xmlNfse?: string
  pdfUrl?: string
  erro?: string
  codigoErro?: string
  detalhes?: string
  /** Rascunho que guarda a numeração desta emissão (criado pelo servidor quando a emissão é direta). */
  rascunhoId?: string
  /** id em nfse_emitidas da nota gravada/encontrada. */
  nfseId?: string
  /** A nota já existia (rascunho já emitido ou encontrada na Sefin) — nada foi reenviado. */
  jaEmitida?: boolean
  /** A nota foi encontrada na Sefin por consulta (timeout anterior / DPS repetida) e registrada sem reenviar. */
  reconciliada?: boolean
  mensagem?: string
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
  /**
   * Consulta pela DPS/chave: true = a nota existe na Sefin; false = consulta
   * CONCLUSIVA de que não existe (404). Ausente = o conector não informa.
   */
  encontrada?: boolean
  status?: 'emitida' | 'cancelada' | 'rejeitada' | 'processando' | 'erro'
  mensagem?: string
  numeroNfse?: string
  codigoVerificacao?: string
  chaveAcesso?: string
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
  '3509205': 'Cajamar',
  '3513009': 'Cotia',
  '3547304': 'Santana de Parnaíba',
  '3552809': 'Taboão da Serra',
}

/**
 * Códigos IBGE que a plataforma gravou ERRADO até 2026-11-05 (confirmado na API
 * de localidades do IBGE): 3508900 é Caiabu e 3552502 é Suzano. Configurações
 * fiscais salvas com eles continuam funcionando — normalizarIbge() converte na
 * borda, antes de rotear e de montar o XML enviado à prefeitura.
 */
export const IBGE_LEGADO: Record<string, string> = {
  '3508900': '3509205', // gravado como Cajamar (era Caiabu)
  '3552502': '3552809', // gravado como Taboão da Serra (era Suzano)
}

export function normalizarIbge(ibge: string | undefined | null): string {
  const codigo = String(ibge ?? '').trim()
  return IBGE_LEGADO[codigo] ?? codigo
}
