/**
 * Quais contratos de `nfse_recorrentes` entram na varredura de hoje — lógica
 * pura, sem Firestore.
 *
 * Vive separada de rascunhos.ts pelo mesmo motivo de scheduler/recorrencia.ts:
 * aquele arquivo importa firebase-admin no topo e não sobe num teste de unidade.
 * E esta é a decisão mais cara de errar do produto inteiro: ela manda emitir
 * NOTA FISCAL REAL em nome do cliente. Errar o dia emite antes da data
 * contratada; errar o tomador emite para a pessoa errada — e nota emitida só
 * volta atrás com cancelamento na prefeitura.
 *
 * As datas são estruturais (`{ toDate(): Date }`) para este módulo não arrastar
 * o firebase-admin. É também o formato que `vigenteNoMes()` já espera, então um
 * documento de `nfse_recorrentes` entra nela direto.
 */

import { vigenteNoMes } from '../scheduler/recorrencia'

export type DataFirestore = { toDate(): Date }

/**
 * Como o dia de emissão restringe a varredura:
 *  - 'somente_hoje': só quem faz aniversário HOJE. É o modo do cron diário —
 *    sem ele, a varredura pega o mês inteiro e emite de verdade, no dia 1º, a
 *    nota do contrato que só deveria sair no dia 25. Vale pra CRIAR item novo;
 *    rascunho pendente de um dia anterior é retomado em qualquer modo.
 *  - 'ate_hoje': no mês corrente, ignora quem ainda não chegou no dia. É o que
 *    o botão "Preparar mês" sempre fez.
 *  - 'todos': o mês inteiro, sem olhar o dia — quando a tela pede
 *    explicitamente `gerarAteHoje: false` (mês fechado, correção manual).
 */
export type FiltroDia = 'somente_hoje' | 'ate_hoje' | 'todos'

/**
 * Recorte de `nfse_recorrentes` que a decisão precisa. Os campos vêm tipados
 * como `unknown` de propósito: o Admin SDK não valida nada e as regras do
 * Firestore só cobrem escrita vinda do navegador — importação em massa ou um
 * script antigo podem ter gravado `valor` como string ou `diaEmissao` como
 * "10". Coerção e recusa acontecem aqui, não na prefeitura.
 */
export type ContratoNfseRecorrente = {
  id: string
  clienteId?: string
  tomadorId?: string
  tomadorNome?: unknown
  tomadorCpfCnpj?: unknown
  descricao?: unknown
  valor?: unknown
  diaEmissao?: unknown
  itemListaServico?: unknown
  codigoServico?: unknown
  aliquota?: unknown
  issRetido?: unknown
  ativo?: unknown
  dataInicio?: DataFirestore
  dataFim?: DataFirestore
}

/** Recorte de `clientes_fiscal` de onde os campos fiscais vazios herdam. */
export type PadraoFiscalCliente = {
  codigoServicoPadrao?: unknown
  itemListaServico?: unknown
  aliquotaPadrao?: unknown
  issRetidoPadrao?: unknown
  descricaoServicoPadrao?: unknown
  cnae?: unknown
}

/** Recorte de `tomadores` — o cadastro, não o payload que vai à prefeitura. */
export type TomadorCadastro = {
  clienteId?: unknown
  ativo?: unknown
  deletedAt?: unknown
}

// ─── Helpers de coerção ──────────────────────────────────────────────────────

function texto(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function digitos(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * `null`, `undefined` e string vazia são AUSÊNCIA, não zero.
 *
 * `Number(null)` e `Number('')` valem 0, e era assim que a alíquota chegava na
 * nota: cliente com `aliquotaPadrao: null` (valor que o formulário de config
 * fiscal grava quando o campo fica em branco) passava na checagem
 * `Number.isFinite(Number(x))` e emitia com ISS de 0%. A tela Fiscal já tratava
 * isso como bloqueio; o backend não.
 */
function numeroOuNulo(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Dia do mês válido (1–31) ou null. Aceita "10" porque o Firestore não valida. */
function diaOuNulo(value: unknown): number | null {
  const n = numeroOuNulo(value)
  if (n === null || !Number.isInteger(n) || n < 1 || n > 31) return null
  return n
}

/**
 * Dia contratado normalizado pro tamanho do mês (31 num mês de 30 = dia 30),
 * senão o contrato nunca "faz aniversário" em abril, junho, setembro, novembro
 * e fevereiro — e a nota simplesmente não sai.
 */
export function clampDia(ano: number, mes: number, dia: number): number {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return Math.min(Math.max(1, dia), ultimoDia)
}

export function diaBateNoFiltro(params: {
  diaEfetivo: number
  ano: number
  mes: number
  hoje: Date
  filtroDia: FiltroDia
}): boolean {
  const { diaEfetivo, ano, mes, hoje, filtroDia } = params
  const mesCorrente = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1

  if (filtroDia === 'somente_hoje') return mesCorrente && diaEfetivo === hoje.getDate()
  if (filtroDia === 'ate_hoje') return !(mesCorrente && diaEfetivo > hoje.getDate())
  return true
}

// ─── Dedup por status, com teto ──────────────────────────────────────────────

/**
 * Status de rascunho que ainda representam TRABALHO PENDENTE. Existir não é
 * dedup suficiente: o cron que cria 40 rascunhos, emite 12 e morre no 13º por
 * timeout precisa terminar o serviço na rodada seguinte, e não olhar os 40
 * documentos e concluir "nada pendente" — os 27 restantes nunca mais sairiam.
 * Fora da lista de propósito: 'emitida' e 'processando' (nota já saiu ou está
 * sob o lock da transação em emitir.ts) e os estados de revisão humana
 * ('rascunho', 'pronto_para_emitir', ...), que são do operador — recriar
 * apagaria o que ele editou na tela.
 */
export const STATUS_REPROCESSAVEIS = new Set(['aguardando_emissao', 'erro_integracao'])

/**
 * Teto de tentativas automáticas por rascunho. Erro transitório (rede, 429,
 * prefeitura fora do ar) se resolve em poucas rodadas; erro permanente
 * (certificado errado, município mal configurado, payload inválido) não se
 * resolve nunca — e sem teto o cron reemitiria todo dia, para sempre, gerando
 * um `nfse_erros` por dia e escondendo o problema real no volume.
 * Estourado o teto, o rascunho sai da fila automática e espera um humano: ele
 * continua visível na tela Fiscal em 'erro_integracao'.
 */
export const MAX_TENTATIVAS_AUTOMATICAS = 3

export function podeReprocessar(status: string | undefined, tentativas: number): boolean {
  return status !== undefined
    && STATUS_REPROCESSAVEIS.has(status)
    && tentativas < MAX_TENTATIVAS_AUTOMATICAS
}

// ─── Decisão: este contrato entra hoje? ──────────────────────────────────────

export type MotivoDescarte =
  | 'contrato_inativo'
  | 'fora_de_vigencia'
  | 'sem_valor'
  | 'sem_tomador'
  | 'sem_dia_emissao'
  | 'fora_do_dia'
  | 'aguardando_revisao'
  | 'ja_processado'
  | 'teto_de_tentativas'

export type Selecao =
  | { entra: true; diaEfetivo: number; reprocessar: boolean }
  | { entra: false; motivo: MotivoDescarte; silencioso: boolean }

/**
 * Motivos que valem para QUASE TODO CONTRATO, TODO DIA: registrar cada um deles
 * enche o log de auditoria com centenas de linhas por rodada e esconde o motivo
 * de verdade (o cliente cuja nota não saiu por falta de configuração).
 */
const MOTIVOS_SILENCIOSOS = new Set<MotivoDescarte>([
  'fora_do_dia',
  'fora_de_vigencia',
  'aguardando_revisao',
  'ja_processado',
])

/** Lista única de quem é silencioso: dois lugares divergiriam com o tempo. */
function descartar(motivo: MotivoDescarte): Selecao {
  return { entra: false, motivo, silencioso: MOTIVOS_SILENCIOSOS.has(motivo) }
}

const TEXTO_MOTIVO: Record<MotivoDescarte, string> = {
  contrato_inativo: 'contrato de emissão inativo.',
  fora_de_vigencia: 'contrato fora da vigência nesta competência.',
  sem_valor: 'contrato sem valor positivo.',
  sem_tomador: 'contrato sem tomador válido (nome e CPF/CNPJ de 11 ou 14 dígitos).',
  sem_dia_emissao: 'sem dia de emissão no contrato nem no cadastro do cliente.',
  fora_do_dia: 'fora do dia de emissão contratado.',
  aguardando_revisao: 'rascunho já criado, aguardando revisão manual.',
  ja_processado: 'já processado nesta competência.',
  teto_de_tentativas: `emissão automática parou após ${MAX_TENTATIVAS_AUTOMATICAS} tentativas — precisa de revisão manual.`,
}

export function descreverMotivo(motivo: MotivoDescarte): string {
  return TEXTO_MOTIVO[motivo]
}

/**
 * Um contrato = um par prestador+tomador. Um cliente com 40 tomadores tem 40
 * contratos e, no dia certo, gera 40 rascunhos — por isso a decisão é por
 * CONTRATO, e não mais por cliente.
 *
 * A ordem das checagens importa: vigência e valor vêm antes do dia porque um
 * contrato encerrado não deve nem ser "retomado" por um rascunho pendente que
 * ficou para trás. Já o rascunho existente é avaliado DEPOIS do dia porque
 * retomada não olha o calendário: o rascunho que o cron de ontem criou e não
 * conseguiu emitir precisa sair hoje, mesmo que o aniversário tenha sido ontem.
 */
export function selecionarContrato(params: {
  contrato: ContratoNfseRecorrente
  ano: number
  mes: number
  hoje: Date
  filtroDia: FiltroDia
  /** `clientes.diaEmissaoNFSe` — usado quando o contrato não traz o dia. */
  diaPadraoDoCliente?: unknown
  /** `clientes_fiscal.emissaoAutomatica` do PRESTADOR. */
  emissaoAutomatica: boolean
  /** Rascunho já existente para este contrato nesta competência, se houver. */
  rascunhoExistente?: { status?: string; tentativas?: number }
}): Selecao {
  const { contrato, ano, mes, hoje, filtroDia, emissaoAutomatica, rascunhoExistente } = params

  // A query já filtra `ativo == true`; isto é defesa em profundidade para a
  // varredura de um cliente específico e para documento gravado sem o campo.
  if (contrato.ativo === false) {
    return descartar('contrato_inativo')
  }

  if (!vigenteNoMes(contrato, ano, mes)) {
    return descartar('fora_de_vigencia')
  }

  const valor = numeroOuNulo(contrato.valor)
  if (valor === null || valor <= 0) {
    return descartar('sem_valor')
  }

  // O tomador é o CLIENTE DO CLIENTE. Sem nome e documento válidos não existe
  // nota: era exatamente aqui que o gerador antigo caía no próprio prestador,
  // emitindo a nota do cliente para ele mesmo.
  const tomadorNome = texto(contrato.tomadorNome)
  const tomadorDoc = digitos(contrato.tomadorCpfCnpj)
  if (!tomadorNome || (tomadorDoc.length !== 11 && tomadorDoc.length !== 14)) {
    return descartar('sem_tomador')
  }

  // O dia é do CONTRATO; `clientes.diaEmissaoNFSe` é só o padrão de quem não
  // preencheu. Dois tomadores do mesmo prestador podem ser faturados em dias
  // diferentes, e é o contrato que sabe disso.
  const dia = diaOuNulo(contrato.diaEmissao) ?? diaOuNulo(params.diaPadraoDoCliente)
  if (dia === null) {
    return descartar('sem_dia_emissao')
  }
  const diaEfetivo = clampDia(ano, mes, dia)

  if (rascunhoExistente) {
    const status = rascunhoExistente.status
    const tentativas = rascunhoExistente.tentativas ?? 0

    // Documento já existe: só volta pra fila sozinho quem tem emissão
    // automática ligada — nos demais quem emite é um humano na tela, e recriar
    // apagaria o que ele editou.
    if (!emissaoAutomatica) {
      return descartar('aguardando_revisao')
    }
    if (status === undefined || !STATUS_REPROCESSAVEIS.has(status)) {
      return descartar('ja_processado')
    }
    if (tentativas >= MAX_TENTATIVAS_AUTOMATICAS) {
      return descartar('teto_de_tentativas')
    }
    return { entra: true, diaEfetivo, reprocessar: true }
  }

  // Item novo: respeita o dia contratado. É aqui que o cron diário deixa de
  // criar (e emitir) a nota de quem só é faturado dia 25.
  if (!diaBateNoFiltro({ diaEfetivo, ano, mes, hoje, filtroDia })) {
    return descartar('fora_do_dia')
  }

  return { entra: true, diaEfetivo, reprocessar: false }
}

// ─── Campos fiscais: contrato sobrepõe, `clientes_fiscal` completa ───────────

export type CamposFiscais = {
  descricaoServico: string
  codigoServico: string
  itemListaServico: string
  cnae: string | null
  aliquota: number
  issRetido: boolean
}

export type ResolucaoFiscal =
  | { ok: true; campos: CamposFiscais }
  | { ok: false; faltando: string[] }

/**
 * Preencher os campos fiscais no contrato é a EXCEÇÃO — o contrato cujo serviço
 * difere do padrão do cliente. Vazio herda de `clientes_fiscal`.
 *
 * A checagem saiu do nível do cliente para o nível do contrato de propósito: com
 * herança, um cliente sem `codigoServicoPadrao` ainda emite se os contratos dele
 * trouxerem o código — recusar o cliente inteiro antes de olhar os contratos
 * bloquearia notas que têm tudo o que precisam.
 */
export function resolverCamposFiscais(
  contrato: ContratoNfseRecorrente,
  fiscal: PadraoFiscalCliente,
): ResolucaoFiscal {
  const itemListaServico = texto(contrato.itemListaServico) ?? texto(fiscal.itemListaServico)
  // Mesmo fallback de antes: quem não tem código municipal separado usa o item
  // da lista LC116 como código.
  const codigoServico = texto(contrato.codigoServico)
    ?? texto(fiscal.codigoServicoPadrao)
    ?? itemListaServico
  const aliquota = numeroOuNulo(contrato.aliquota) ?? numeroOuNulo(fiscal.aliquotaPadrao)

  const faltando: string[] = []
  if (!itemListaServico) faltando.push('item da lista de serviço')
  if (!codigoServico) faltando.push('código de serviço')
  // Alíquota 0 explícita é legítima (imune/isento) e passa; o que não passa é
  // campo em branco virando 0% sem ninguém decidir isso.
  if (aliquota === null || aliquota < 0) faltando.push('alíquota')

  // As três condições repetem `faltando` porque o TypeScript não estreita o
  // tipo a partir do tamanho do array — sem elas, `codigoServico` continuaria
  // `string | null` no retorno de sucesso.
  if (!itemListaServico || !codigoServico || aliquota === null || aliquota < 0) {
    return { ok: false, faltando }
  }

  return {
    ok: true,
    campos: {
      descricaoServico: texto(contrato.descricao)
        ?? texto(fiscal.descricaoServicoPadrao)
        ?? 'Serviços prestados',
      codigoServico,
      itemListaServico,
      cnae: texto(fiscal.cnae),
      aliquota,
      // `false` no contrato é uma decisão, não ausência — por isso o teste é de
      // tipo, e não `??`, que deixaria o padrão do cliente sobrepor um "não
      // retém" explícito.
      issRetido: typeof contrato.issRetido === 'boolean'
        ? contrato.issRetido
        : fiscal.issRetidoPadrao === true,
    },
  }
}

// ─── Tomador: o contrato aponta pro cadastro certo? ──────────────────────────

export type ProblemaTomador = 'nao_cadastrado' | 'de_outro_prestador' | 'inativo'

export type VeredictoTomador = {
  /** true = não emite. Só bloqueia o que é errado, não o que é incompleto. */
  bloqueia: boolean
  problema?: ProblemaTomador
}

/**
 * As regras do Firestore já impedem o navegador de apontar um contrato para o
 * tomador de outro prestador, mas o Admin SDK ignora regras e contrato antigo
 * pode ter nascido torto. Emitir aqui significaria a nota do cliente A sair para
 * o cliente de B — e a carteira de B, que é a lista de clientes dele, vazar
 * dentro de uma nota fiscal. Isso bloqueia.
 *
 * Tomador não cadastrado NÃO bloqueia: os campos que vão na nota
 * (`tomadorNome`/`tomadorCpfCnpj`) estão denormalizados no contrato e a maioria
 * das prefeituras não exige o endereço. Sai sem endereço e o motivo fica no log.
 */
export function avaliarTomador(
  contrato: ContratoNfseRecorrente,
  tomador: TomadorCadastro | undefined,
): VeredictoTomador {
  if (!tomador) return { bloqueia: false, problema: 'nao_cadastrado' }
  if (tomador.clienteId !== contrato.clienteId) {
    return { bloqueia: true, problema: 'de_outro_prestador' }
  }
  if (tomador.ativo === false || tomador.deletedAt) {
    return { bloqueia: true, problema: 'inativo' }
  }
  return { bloqueia: false }
}

const TEXTO_PROBLEMA_TOMADOR: Record<ProblemaTomador, string> = {
  nao_cadastrado: 'tomador do contrato não existe mais em `tomadores` — nota emitida sem endereço.',
  de_outro_prestador: 'tomador cadastrado na carteira de OUTRO cliente — emissão bloqueada.',
  inativo: 'tomador inativo ou excluído — encerre o contrato de emissão.',
}

export function descreverProblemaTomador(problema: ProblemaTomador): string {
  return TEXTO_PROBLEMA_TOMADOR[problema]
}
