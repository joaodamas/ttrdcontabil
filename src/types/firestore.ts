import { Timestamp } from 'firebase/firestore'

// ============================================================
// TIPOS BASE
// ============================================================

export type PerfilUsuario = 'admin' | 'operacional' | 'fiscal' | 'financeiro' | 'leitura'
export type TipoPessoa = 'pf' | 'pj'
export type StatusCliente = 'ativo' | 'inativo' | 'suspenso'
export type RegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei' | 'isento'
export type FrequenciaServico = 'mensal' | 'avulso' | 'anual' | 'trimestral'
export type StatusServico = 'ativo' | 'inativo' | 'suspenso'
export type StatusCompetencia = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'
export type StatusTarefa = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada'
export type PrioridadeTarefa = 'baixa' | 'normal' | 'alta' | 'urgente'
export type StatusIr = 'pendente' | 'em_andamento' | 'entregue' | 'retificado' | 'cancelado'
export type TipoLancamento = 'receita' | 'despesa'
export type StatusPagamento = 'pendente' | 'pago' | 'atrasado' | 'cancelado' | 'estornado'
export type TipoIntegracaoNfse = 'nacional' | 'prefeitura' | 'provedor' | 'manual_assistido'
export type TipoConector = 'nacional' | 'prefeitura' | 'provedor' | 'manual'
export type StatusRascunhoNfse = 'rascunho' | 'validando' | 'pronto_para_emitir' | 'erro_validacao'
export type StatusNfse = 'emitida' | 'pendente_processamento' | 'rejeitada' | 'cancelada' | 'erro_integracao'
export type TipoEventoNfse = 'emissao' | 'consulta' | 'cancelamento' | 'download_xml' | 'download_pdf' | 'erro' | 'reenvio'
export type StatusFila = 'aguardando' | 'processando' | 'processado' | 'erro' | 'cancelado'

// ============================================================
// COLEÇÕES DO FIRESTORE
// ============================================================

// Coleção: usuarios
export interface UsuarioDoc {
  nome: string
  email: string
  perfil: PerfilUsuario
  ativo: boolean
  ultimoAcesso?: Timestamp
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: clientes
export interface ClienteDoc {
  tipoPessoa: TipoPessoa
  razaoSocial: string
  nomeFantasia?: string
  cpfCnpj: string
  email?: string
  telefone?: string
  celular?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  regimeTributario?: RegimeTributario
  responsavelNome?: string
  responsavelEmail?: string
  responsavelTelefone?: string
  observacoes?: string
  status: StatusCliente
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
  // Soft-delete: definido ao excluir, nunca deletar fisicamente
  deletedAt?: Timestamp
  deletedById?: string
}

// Coleção: servicos
export interface ServicoDoc {
  nome: string
  descricao?: string
  frequencia: FrequenciaServico
  valorPadrao?: number
  ativo: boolean
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: clientes_servicos
export interface ClienteServicoDoc {
  clienteId: string
  servicoId: string
  servicoNome: string      // denormalizado para exibição rápida
  clienteNome: string      // denormalizado
  valor: number
  diaVencimento?: number
  dataInicio: Timestamp
  dataFim?: Timestamp
  observacoes?: string
  status: StatusServico
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: competencias
export interface CompetenciaDoc {
  clienteId: string
  clienteNome: string      // denormalizado
  clienteServicoId?: string
  servicoNome?: string     // denormalizado
  mes: number
  ano: number
  status: StatusCompetencia
  observacoes?: string
  responsavelId?: string
  responsavelNome?: string // denormalizado
  dataConclusao?: Timestamp
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: tarefas
export interface TarefaDoc {
  clienteId?: string
  clienteNome?: string     // denormalizado
  competenciaId?: string
  titulo: string
  descricao?: string
  prioridade: PrioridadeTarefa
  status: StatusTarefa
  responsavelId?: string
  responsavelNome?: string // denormalizado
  dataPrazo?: Timestamp
  dataConclusao?: Timestamp
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: tarefas_comentarios
export interface TarefaComentarioDoc {
  tarefaId: string
  usuarioId: string
  usuarioNome: string      // denormalizado
  texto: string
  criadoEm: Timestamp
}

// Coleção: ir_declaracoes
export interface IrDeclaracaoDoc {
  clienteId: string
  clienteNome: string      // denormalizado
  anoBase: number
  status: StatusIr
  responsavelId?: string
  responsavelNome?: string
  dataEntrega?: Timestamp
  numeroRecibo?: string
  observacoes?: string
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: ir_checklist
export interface IrChecklistDoc {
  declaracaoId: string
  descricao: string
  recebido: boolean
  dataRecebimento?: Timestamp
  observacao?: string
  criadoEm: Timestamp
}

// Coleção: lancamentos
export interface LancamentoDoc {
  clienteId?: string
  clienteNome?: string     // denormalizado
  competenciaId?: string
  clienteServicoId?: string
  tipo: TipoLancamento
  descricao: string
  valor: number
  dataVencimento: Timestamp
  dataPagamento?: Timestamp
  status: StatusPagamento
  formaPagamento?: string
  observacoes?: string
  nfseId?: string          // vínculo com nota emitida
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: documentos
export interface DocumentoDoc {
  clienteId?: string
  competenciaId?: string
  irId?: string
  tarefaId?: string
  nome: string
  descricao?: string
  tipoMime?: string
  tamanhoBytes?: number
  storageUrl: string
  storagePath: string      // path no Firebase Storage
  criadoPorId?: string
  criadoEm: Timestamp
}

// Coleção: configuracoes
export interface ConfiguracaoDoc {
  chave: string
  valor?: string
  descricao?: string
  atualizadoPorId?: string
  atualizadoEm: Timestamp
}

// Coleção: logs_auditoria
export interface LogAuditoriaDoc {
  usuarioId?: string
  usuarioNome?: string
  entidade: string
  entidadeId?: string
  acao: string
  dadosAntes?: Record<string, unknown>
  dadosDepois?: Record<string, unknown>
  ip?: string
  criadoEm: Timestamp
}

// ============================================================
// MÓDULO FISCAL
// ============================================================

// Coleção: clientes_fiscal
export interface ClienteFiscalDoc {
  clienteId: string
  municipioEmissor: string
  uf: string
  codigoMunicipioIbge?: string
  inscricaoMunicipal?: string
  regimeTributario?: RegimeTributario
  optanteSimples: boolean
  incentivadorCultural: boolean
  naturezaOperacaoPadrao?: string
  codigoServicoPadrao?: string
  descricaoServicoPadrao?: string
  aliquotaPadrao?: number
  itemListaServico?: string
  cnae?: string
  ambienteEmissao: 'producao' | 'homologacao'
  tipoIntegracaoNfse: TipoIntegracaoNfse
  ativo: boolean
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: fiscal_conectores
export interface FiscalConectorDoc {
  nome: string
  slug: string
  tipo: TipoConector
  ativo: boolean
  observacao?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: clientes_fiscal_integracao
export interface ClienteFiscalIntegracaoDoc {
  clienteId: string
  conectorId: string
  conectorNome: string     // denormalizado
  identificadorExterno?: string
  usaCertificado: boolean
  usaLoginSenha: boolean
  usaToken: boolean
  usaGov: boolean
  configJson?: Record<string, unknown>
  ativo: boolean
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: certificados_digitais
export interface CertificadoDigitalDoc {
  clienteId: string
  nomeCertificado: string
  arquivoStorageUrl: string
  arquivoStoragePath: string
  senhaReferencia?: string  // referência ao vault, nunca a senha em si
  validadeInicio?: Timestamp
  validadeFim: Timestamp
  ativo: boolean
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: nfse_templates
export interface NfseTemplateDoc {
  clienteId?: string
  servicoId?: string
  titulo: string
  descricaoServicoPadrao?: string
  codigoServico?: string
  aliquota?: number
  ativo: boolean
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: nfse_rascunhos
export interface NfseRascunhoDoc {
  clienteId: string
  clienteNome: string
  competenciaId?: string
  clienteServicoId?: string
  templateId?: string
  titulo?: string
  dados: Record<string, unknown>  // campos da nota
  status: StatusRascunhoNfse
  criadoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: nfse_emitidas
export interface NfseEmitidaDoc {
  clienteId: string
  clienteNome: string
  competenciaId?: string
  clienteServicoId?: string
  conectorId?: string
  conectorNome?: string
  rascunhoId?: string
  lancamentoId?: string
  numeroRps?: string
  numeroNfse?: string
  serie?: string
  codigoVerificacao?: string
  status: StatusNfse
  dataEmissao?: Timestamp
  tomadorNome?: string
  tomadorCpfCnpj?: string
  tomadorEmail?: string
  tomadorMunicipio?: string
  tomadorUf?: string
  descricaoServico: string
  codigoServico?: string
  valorServico: number
  valorDeducoes: number
  valorLiquido?: number
  aliquota?: number
  issRetido: boolean
  valorIss?: number
  xmlUrl?: string
  pdfUrl?: string
  linkConsulta?: string
  chaveExterna?: string
  protocolo?: string
  respostaIntegracao?: Record<string, unknown>
  emitidoPorId?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// Coleção: nfse_eventos
export interface NfseEventoDoc {
  nfseId: string
  tipoEvento: TipoEventoNfse
  status?: string
  mensagem?: string
  payloadEnvio?: Record<string, unknown>
  payloadRetorno?: Record<string, unknown>
  usuarioId?: string
  criadoEm: Timestamp
}

// Coleção: nfse_fila_processamento
export interface NfseFilaDoc {
  nfseRascunhoId: string
  clienteId: string
  conectorId: string
  status: StatusFila
  tentativas: number
  maxTentativas: number
  ultimoErro?: string
  agendadoPara: Timestamp
  processadoEm?: Timestamp
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// ============================================================
// MÓDULO FECHAMENTO MENSAL
// ============================================================

export type StatusObrigacao = 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
export type FormaEntrega = 'guia' | 'sm' | 'programa' | 'email' | 'manual'

// Coleção: fechamentos (uma entrada por cliente/mês/ano)
export interface FechamentoDoc {
  clienteId: string
  clienteNome: string
  clienteCodigo: number
  mes: number
  ano: number
  regime: RegimeTributario
  responsavel: string
  portalUrl?: string
  formaEntrega?: FormaEntrega | null

  // Obrigações
  dasStatus: StatusObrigacao          // DAS / Simples Nacional
  esocialStatus: StatusObrigacao      // eSocial
  reinfStatus: StatusObrigacao        // REINF
  fgtsStatus: StatusObrigacao         // FGTS

  observacoes?: string
  criadoEm: Timestamp
  atualizadoEm: Timestamp
}

// ============================================================
// TIPO HELPER — Documento com ID
// ============================================================
export type WithId<T> = T & { id: string }
