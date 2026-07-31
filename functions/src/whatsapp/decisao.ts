/**
 * Decisões da régua de WhatsApp — lógica pura, sem Firestore.
 *
 * Vive separada de core.ts porque aquele arquivo importa firebase-admin e o SDK
 * da Twilio no topo: nada dele sobe num teste de unidade. O que decide QUAL
 * template sai, SE a confirmação de baixa é devida e QUANTAS mensagens um
 * cliente aguenta por dia é justamente o que mais precisa de teste — errar aqui
 * é mensagem errada no telefone de um cliente real.
 *
 * As datas entram como `Date` (nunca Timestamp) para este módulo não arrastar o
 * SDK, no mesmo padrão de scheduler/recorrencia.ts.
 */

/** Job nascido da régua de cobrança (D-7…D+7). */
export const TIPO_JOB_COBRANCA = 'cobranca'
/** Job nascido da baixa do lançamento — desacoplado da régua. */
export const TIPO_JOB_CONFIRMACAO = 'confirmacao'

/** Etapa sintética da confirmação: não tem vencimento nem dias antes/depois. */
export const ETAPA_CONFIRMACAO_PAGAMENTO = 'CONFIRMACAO'
export const TEMPLATE_CONFIRMACAO_PAGAMENTO = 'cobranca_baixa_confirmada'

/**
 * Depois disso a baixa não vira mais mensagem. Uma confirmação de um pagamento
 * de dois meses atrás (conciliação em lote, backfill) não é um recibo: é uma
 * mensagem que o cliente não reconhece — exatamente a ligação de "que cobrança
 * é essa?" que a automação existe para evitar.
 */
export const DIAS_VALIDADE_CONFIRMACAO = 7

/**
 * Teto conservador de mensagens por cliente por dia. Com a deduplicação atual
 * (lançamento + etapa + dia) um cliente com 3 serviços atrasados podia receber
 * até 15 mensagens no mesmo ciclo — volume que a Meta lê como spam antes de
 * qualquer cliente reclamar.
 */
export const TETO_DIARIO_PADRAO = 3
/** Acima disso não é mais teto; é o número sem limite com outro nome. */
export const TETO_DIARIO_MAXIMO = 20

const TEMPLATE_POR_ETAPA: Record<string, string> = {
  'D-7': 'cobranca_pre_vencimento_7',
  'D-3': 'cobranca_pre_vencimento_3',
  D0: 'cobranca_vencimento_hoje',
  'D+3': 'cobranca_atraso_leve',
  'D+7': 'cobranca_atraso_critico',
}

/**
 * Template correspondente a uma etapa, quando a regra não declara um.
 *
 * ARMADILHA: o `switch` anterior tinha `default: 'cobranca_pre_vencimento_3'`.
 * Criar uma etapa D+15 no banco enfileirava o job e mandava "vence em 3 dias"
 * para quem estava 15 dias atrasado. Aqui a etapa desconhecida é interpretada
 * pelo LADO do vencimento; e quando nem isso dá para deduzir devolvemos null —
 * o chamador cancela com motivo visível em vez de escolher uma mensagem no
 * escuro. Mandar a mensagem errada é pior que não mandar.
 */
export function mapEtapaToTemplate(etapa: string | null | undefined): string | null {
  const chave = String(etapa ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!chave) return null
  if (chave === ETAPA_CONFIRMACAO_PAGAMENTO) return TEMPLATE_CONFIRMACAO_PAGAMENTO

  const exata = TEMPLATE_POR_ETAPA[chave]
  if (exata) return exata

  const match = /^D([+-]?)(\d+)$/.exec(chave)
  if (!match) return null

  const dias = Number(match[2])
  if (match[1] === '-') return dias >= 5 ? 'cobranca_pre_vencimento_7' : 'cobranca_pre_vencimento_3'
  if (dias === 0) return 'cobranca_vencimento_hoje'
  return dias >= 7 ? 'cobranca_atraso_critico' : 'cobranca_atraso_leve'
}

export type OrigemTemplate = 'regra' | 'job' | 'mapa' | 'nenhuma'

/**
 * Qual template a mensagem usa.
 *
 * A regra manda: `templateKey` é editável na UI e existe exatamente para o
 * escritório criar etapa nova sem deploy. O valor gravado no job é a segunda
 * fonte (a regra pode ter sido apagada depois do enfileiramento) e o mapa por
 * etapa é o último recurso.
 */
export function resolverTemplateKey(entrada: {
  templateKeyRegra?: string | null
  templateKeyJob?: string | null
  etapa?: string | null
}): { templateKey: string | null; origem: OrigemTemplate } {
  const daRegra = String(entrada.templateKeyRegra ?? '').trim()
  if (daRegra) return { templateKey: daRegra, origem: 'regra' }

  const doJob = String(entrada.templateKeyJob ?? '').trim()
  if (doJob) return { templateKey: doJob, origem: 'job' }

  const doMapa = mapEtapaToTemplate(entrada.etapa)
  if (doMapa) return { templateKey: doMapa, origem: 'mapa' }

  return { templateKey: null, origem: 'nenhuma' }
}

/**
 * Teto configurado pelo escritório, saneado.
 *
 * Zero não é aceito de propósito: seria um jeito silencioso de desligar a régua
 * inteira por um erro de digitação — para desligar existe o interruptor
 * `whatsappCloudApiEnabled`, que diz o que está acontecendo.
 */
export function normalizarTetoDiario(valor: unknown): number {
  // ARMADILHA: `Number(null)` e `Number('')` são 0, não NaN. Sem esta guarda um
  // campo gravado como null pelo formulário viraria teto 1 — a régua inteira
  // estrangulada em uma mensagem por cliente por dia, sem nenhum erro visível.
  if (valor === null || valor === undefined || valor === '') return TETO_DIARIO_PADRAO
  const numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(numero)) return TETO_DIARIO_PADRAO
  const inteiro = Math.floor(numero)
  if (inteiro < 1) return 1
  return Math.min(inteiro, TETO_DIARIO_MAXIMO)
}

export type VeredictoTeto = {
  permitido: boolean
  teto: number
  enviadasHoje: number
  motivo?: string
}

/**
 * Teto de mensagens por CLIENTE por dia.
 *
 * A deduplicação existente é por lançamento+etapa+dia: ela impede o envio
 * repetido da mesma cobrança, mas não sabe que os 5 jobs de hoje vão todos para
 * o mesmo telefone. Este é o limite que o dono do número precisa.
 */
export function avaliarTetoDiario(entrada: { enviadasHoje: unknown; teto: unknown }): VeredictoTeto {
  const teto = normalizarTetoDiario(entrada.teto)
  const bruto = typeof entrada.enviadasHoje === 'number' ? entrada.enviadasHoje : Number(entrada.enviadasHoje)
  const enviadasHoje = Number.isFinite(bruto) && bruto > 0 ? Math.floor(bruto) : 0

  if (enviadasHoje < teto) return { permitido: true, teto, enviadasHoje }

  return {
    permitido: false,
    teto,
    enviadasHoje,
    // Adiado, nunca cancelado: a cobrança continua devida, só não cabe hoje.
    motivo: `Teto de ${teto} mensagem(ns) por dia atingido para este cliente (${enviadasHoje} hoje) — envio adiado para a próxima janela.`,
  }
}

export type EstadoBaixa = {
  status?: string | null
  temDataPagamento?: boolean
}

/**
 * A atualização do lançamento foi uma BAIXA?
 *
 * Cobre os dois formatos: a mudança de status para 'pago' e o caso em que o
 * status já era 'pago' e só agora a data de pagamento foi preenchida. Um novo
 * salvamento de um lançamento que já estava pago não conta — senão qualquer
 * edição de descrição dispararia outra confirmação.
 */
export function detectouBaixaDePagamento(antes: EstadoBaixa, depois: EstadoBaixa): boolean {
  const pago = (estado: EstadoBaixa) =>
    String(estado.status ?? '').trim().toLowerCase() === 'pago' && Boolean(estado.temDataPagamento)
  return pago(depois) && !pago(antes)
}

export type EntradaConfirmacaoPagamento = {
  /** Interruptor geral do canal (`configuracoes/escritorio`). */
  canalHabilitado: boolean
  tipo?: string | null
  status?: string | null
  valor?: number | null
  dataPagamento?: Date | null
  clienteAtivo: boolean
  /** `aceiteWhatsAppCobranca` — o mesmo consentimento da régua. */
  consentimento: boolean
  clientePausado: boolean
  temContatoValido: boolean
  numeroOptOut: boolean
  agora: Date
  diasValidade?: number
}

export type VeredictoConfirmacao = { enviar: boolean; motivo: string }

/**
 * Confirmação de baixa: mensagem de utilidade que o cliente ESPERA.
 *
 * É avaliada duas vezes — ao enfileirar (no trigger da baixa) e no instante do
 * envio — porque entre uma e outra a baixa pode ter sido revertida ou o cliente
 * pode ter pedido opt-out. Nada aqui é cortesia: consentimento, pausa e opt-out
 * valem igual ao da cobrança, porque para a Meta é o mesmo número.
 */
export function decidirConfirmacaoPagamento(entrada: EntradaConfirmacaoPagamento): VeredictoConfirmacao {
  if (!entrada.canalHabilitado) return { enviar: false, motivo: 'Canal de WhatsApp desabilitado nos parâmetros.' }
  if (entrada.tipo !== 'receita') return { enviar: false, motivo: 'Somente receitas geram confirmação de pagamento.' }
  if (String(entrada.status ?? '').trim().toLowerCase() !== 'pago') {
    return { enviar: false, motivo: `Lançamento não está pago (status "${entrada.status ?? 'indefinido'}") — baixa revertida.` }
  }
  if (!entrada.dataPagamento) return { enviar: false, motivo: 'Lançamento pago sem data de pagamento.' }
  if (!(Number(entrada.valor ?? 0) > 0)) return { enviar: false, motivo: 'Lançamento sem valor a confirmar.' }

  const diasValidade = entrada.diasValidade ?? DIAS_VALIDADE_CONFIRMACAO
  const diasDesdeOPagamento = (entrada.agora.getTime() - entrada.dataPagamento.getTime()) / 86400000
  // Pagamento com data futura (baixa lançada adiantada) não é bloqueio: só o
  // atraso conta, e o que importa é o cliente ainda lembrar do pagamento.
  if (diasDesdeOPagamento > diasValidade) {
    return {
      enviar: false,
      motivo: `Baixa retroativa (${Math.floor(diasDesdeOPagamento)} dias) — fora da janela de ${diasValidade} dias para confirmar.`,
    }
  }

  if (!entrada.clienteAtivo) return { enviar: false, motivo: 'Cliente inativo.' }
  if (!entrada.consentimento) return { enviar: false, motivo: 'Cliente sem consentimento para mensagens no WhatsApp.' }
  if (entrada.clientePausado) return { enviar: false, motivo: 'Envios pausados no cadastro do cliente.' }
  if (!entrada.temContatoValido) return { enviar: false, motivo: 'Cliente sem WhatsApp financeiro válido.' }
  if (entrada.numeroOptOut) return { enviar: false, motivo: 'Número pediu opt-out no WhatsApp.' }

  return { enviar: true, motivo: 'Baixa confirmada — mensagem de confirmação devida.' }
}
