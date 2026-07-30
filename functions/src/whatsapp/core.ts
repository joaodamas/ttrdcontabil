import * as admin from 'firebase-admin'
import twilio from 'twilio'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { redactAuditData, sanitizeAuditString, SYSTEM_ACTOR, writeAuditLog } from '../audit'
import { DEFAULT_TENANT_ID } from '../tenant'
import type { ClienteWhatsappTarget, EligibilityResult, LancamentoDoc, WhatsappCampaignRule, WhatsappTenantConfig } from './types'

const db = () => admin.firestore()

const DEFAULT_RULES: Array<Omit<WhatsappCampaignRule, 'tenantId'>> = [
  { ativo: true, etapa: 'D-7', diasAntes: 7, templateKey: 'cobranca_pre_vencimento_7', usarDiasUteis: true, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 10 },
  { ativo: true, etapa: 'D-3', diasAntes: 3, templateKey: 'cobranca_pre_vencimento_3', usarDiasUteis: true, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 20 },
  { ativo: true, etapa: 'D0', diasDepois: 0, templateKey: 'cobranca_vencimento_hoje', usarDiasUteis: false, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 30 },
  { ativo: true, etapa: 'D+3', diasDepois: 3, templateKey: 'cobranca_atraso_leve', usarDiasUteis: false, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: false, prioridade: 40 },
  { ativo: true, etapa: 'D+7', diasDepois: 7, templateKey: 'cobranca_atraso_critico', usarDiasUteis: false, horaMinima: '08:00', horaMaxima: '18:00', exigeAprovacao: true, prioridade: 50 },
]

const DEFAULT_TEMPLATES = [
  { templateKey: 'cobranca_pre_vencimento_7', providerTemplateName: 'cobranca_pre_vencimento_7', providerContentSid: '', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_pre_vencimento_3', providerTemplateName: 'cobranca_pre_vencimento_3', providerContentSid: '', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_vencimento_hoje', providerTemplateName: 'cobranca_vencimento_hoje', providerContentSid: '', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_atraso_leve', providerTemplateName: 'cobranca_atraso_leve', providerContentSid: '', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_atraso_critico', providerTemplateName: 'cobranca_atraso_critico', providerContentSid: '', providerLanguage: 'pt_BR', categoria: 'utility' },
  { templateKey: 'cobranca_baixa_confirmada', providerTemplateName: 'cobranca_baixa_confirmada', providerContentSid: '', providerLanguage: 'pt_BR', categoria: 'utility' },
]

/**
 * Fuso do escritório. Cloud Functions gen2 roda com process.env.TZ em UTC e o
 * `timeZone` do onSchedule só afeta o GATILHO — não o relógio do processo. Por
 * isso NENHUM cálculo de dia/hora desta régua pode usar getHours/setHours: uma
 * janela de "08:00" viraria 08:00Z = 05:00 em Brasília, ou seja, cobrança de
 * madrugada para os 119 clientes.
 */
const TIMEZONE_ESCRITORIO = 'America/Sao_Paulo'

const DIAS_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

const formatadorEscritorio = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE_ESCRITORIO,
  hourCycle: 'h23',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

type PartesEscritorio = { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number; diaSemana: number }

/** Quebra um instante nos componentes de calendário como eles aparecem em Brasília. */
function partesEscritorio(date: Date): PartesEscritorio {
  const partes = Object.fromEntries(
    formatadorEscritorio.formatToParts(date).filter((parte) => parte.type !== 'literal').map((parte) => [parte.type, parte.value])
  ) as Record<string, string>
  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    // '24' aparece em algumas versões do ICU para a meia-noite; normalizamos.
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
    diaSemana: DIAS_SEMANA[partes.weekday] ?? 0,
  }
}

function offsetEscritorioMs(date: Date): number {
  const partes = partesEscritorio(date)
  const comoUtc = Date.UTC(partes.ano, partes.mes - 1, partes.dia, partes.hora, partes.minuto, partes.segundo)
  return comoUtc - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * Converte uma hora de parede de Brasília no instante UTC correspondente.
 * As duas passadas de offset existem para o caso de o Brasil voltar a adotar
 * horário de verão: na virada, o offset do palpite inicial pode ser o antigo.
 */
function instanteEscritorio(ano: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, 0)
  const offsetPalpite = offsetEscritorioMs(new Date(comoUtc))
  const offsetFinal = offsetEscritorioMs(new Date(comoUtc - offsetPalpite))
  return new Date(comoUtc - offsetFinal)
}

function parseHoraMinuto(valor: string | undefined, padrao: string) {
  const [horaBruta, minutoBruto] = String(valor || padrao).split(':')
  const hora = Math.min(Math.max(Number(horaBruta) || 0, 0), 23)
  const minuto = Math.min(Math.max(Number(minutoBruto) || 0, 0), 59)
  return { hora, minuto, totalMinutos: hora * 60 + minuto }
}

/**
 * Normaliza um telefone brasileiro para DDI+DDD+número, em dígitos.
 *
 * ARMADILHA: assumir que todo número que começa com "55" já tem DDI joga
 * cobrança de um cliente do Rio Grande do Sul (DDD 55) no telefone de outra
 * pessoa — dado financeiro entregue a terceiro. A desambiguação correta é pelo
 * COMPRIMENTO: 10/11 dígitos é DDD+número (falta DDI), 12/13 dígitos com "55"
 * na frente já tem DDI. Qualquer outra coisa é cadastro inválido e retorna ''
 * (o chamador trata como "cliente sem WhatsApp válido" em vez de enviar torto).
 */
export function normalizePhone(value: unknown, contexto?: string): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''

  let nacional = ''
  if (digits.length === 10 || digits.length === 11) nacional = digits
  else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) nacional = digits.slice(2)

  const ddd = Number(nacional.slice(0, 2))
  const assinante = nacional.slice(2)
  const celularValido = assinante.length === 9 && assinante.startsWith('9')
  const fixoValido = assinante.length === 8 && !assinante.startsWith('9')

  if (!nacional || ddd < 11 || ddd > 99 || (!celularValido && !fixoValido)) {
    console.warn('[whatsapp][telefone-invalido]', JSON.stringify({ contexto: contexto ?? null, digitos: digits.length }))
    return ''
  }
  return `55${nacional}`
}

/**
 * Chave tolerante ao nono dígito: DDI+DDD+8 últimos dígitos. O cliente pode
 * responder de 55 11 9 8765-4321 enquanto o cadastro guarda o número antigo
 * sem o 9 — para RECONHECER quem pediu opt-out isso não pode falhar.
 */
function chaveComparavelTelefone(digits: string): string {
  if (!digits) return ''
  return `${digits.slice(0, 4)}${digits.slice(-8)}`
}

function differenceInCalendarDays(a: Date, b: Date) {
  const esquerda = partesEscritorio(a)
  const direita = partesEscritorio(b)
  const left = Date.UTC(esquerda.ano, esquerda.mes - 1, esquerda.dia)
  const right = Date.UTC(direita.ano, direita.mes - 1, direita.dia)
  return Math.round((left - right) / 86400000)
}

export type JanelaEnvio = { horaMinima?: string; horaMaxima?: string; usarDiasUteis?: boolean }

/**
 * Decide se `base` está dentro da janela permitida de envio e, quando não está,
 * qual é a próxima abertura. `horaMaxima` e `usarDiasUteis` eram gravados,
 * editáveis na UI e nunca lidos — sem isso um job atrasado na fila dispara
 * às 23h de um domingo, que é o caminho mais curto para denúncia e bloqueio.
 */
export function resolverJanelaEnvio(base: Date, janela: JanelaEnvio): { dentroDaJanela: boolean; proximo: Date; motivo?: string } {
  const minima = parseHoraMinuto(janela.horaMinima, '08:00')
  const maxima = parseHoraMinuto(janela.horaMaxima, '18:00')
  const soDiaUtil = Boolean(janela.usarDiasUteis)
  const faixa = `${String(minima.hora).padStart(2, '0')}:${String(minima.minuto).padStart(2, '0')}-${String(maxima.hora).padStart(2, '0')}:${String(maxima.minuto).padStart(2, '0')}`

  const agora = partesEscritorio(base)
  const minutosAgora = agora.hora * 60 + agora.minuto
  const hojeEhDiaUtil = agora.diaSemana !== 0 && agora.diaSemana !== 6
  const diaPermitido = !soDiaUtil || hojeEhDiaUtil

  if (diaPermitido && minutosAgora >= minima.totalMinutos && minutosAgora <= maxima.totalMinutos) {
    return { dentroDaJanela: true, proximo: base }
  }
  if (diaPermitido && minutosAgora < minima.totalMinutos) {
    return {
      dentroDaJanela: false,
      proximo: instanteEscritorio(agora.ano, agora.mes, agora.dia, minima.hora, minima.minuto),
      motivo: `Fora da janela de envio (${faixa}, horário de Brasília) — adiado para a abertura de hoje.`,
    }
  }
  // Janela já fechou hoje (ou é fim de semana com régua em dias úteis):
  // procura a próxima abertura, no máximo uma semana à frente.
  for (let offset = 1; offset <= 7; offset++) {
    const candidato = partesEscritorio(new Date(base.getTime() + offset * 86400000))
    if (soDiaUtil && (candidato.diaSemana === 0 || candidato.diaSemana === 6)) continue
    return {
      dentroDaJanela: false,
      proximo: instanteEscritorio(candidato.ano, candidato.mes, candidato.dia, minima.hora, minima.minuto),
      motivo: `Fora da janela de envio (${faixa}, horário de Brasília) — adiado para a próxima abertura.`,
    }
  }
  return { dentroDaJanela: false, proximo: new Date(base.getTime() + 86400000), motivo: `Fora da janela de envio (${faixa}).` }
}

export async function ensureWhatsappDefaults(tenantId = DEFAULT_TENANT_ID) {
  const batch = db().batch()
  for (const rule of DEFAULT_RULES) {
    const ref = db().collection('whatsapp_campaign_rules').doc(`${tenantId}_${rule.etapa}`)
    batch.set(ref, { tenantId, ...rule, canal: 'whatsapp', atualizadoEm: FieldValue.serverTimestamp(), criadoEm: FieldValue.serverTimestamp() }, { merge: true })
  }
  for (const template of DEFAULT_TEMPLATES) {
    const ref = db().collection('whatsapp_templates').doc(`${tenantId}_${template.templateKey}`)
    batch.set(ref, {
      tenantId,
      ...template,
      ativo: true,
      variaveisEsperadas: ['nome_cliente', 'servico', 'valor', 'vencimento'],
      canal: 'whatsapp',
      aprovadoProvider: false,
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  await batch.commit()
}

export async function getTenantWhatsappConfig(tenantId: string): Promise<WhatsappTenantConfig> {
  const snap = await db().collection('configuracoes').doc('escritorio').get()
  const data = snap.data() ?? {}
  return {
    tenantId,
    whatsappCloudApiEnabled: Boolean(data.whatsappCloudApiEnabled),
    whatsappTwilioFromNumber: data.whatsappTwilioFromNumber as string | undefined,
    whatsappJanelaHoraMinima: data.whatsappJanelaHoraMinima as string | undefined,
    whatsappJanelaHoraMaxima: data.whatsappJanelaHoraMaxima as string | undefined,
    whatsappUsaDiasUteis: Boolean(data.whatsappUsaDiasUteis ?? true),
  }
}

export async function getWhatsappRules(tenantId: string) {
  const snap = await db()
    .collection('whatsapp_campaign_rules')
    .where('tenantId', '==', tenantId)
    .get()

  if (snap.empty) {
    await ensureWhatsappDefaults(tenantId)
    return getWhatsappRules(tenantId)
  }

  return snap.docs
    .map((doc) => doc.data() as WhatsappCampaignRule)
    .filter((rule) => rule.ativo)
    .sort((a, b) => Number(a.prioridade ?? 0) - Number(b.prioridade ?? 0))
}

export async function resolveBillingTarget(clienteId: string): Promise<ClienteWhatsappTarget | null> {
  const snap = await db().collection('clientes').doc(clienteId).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  const financeiroWhatsapp = normalizePhone(data.responsavelFinanceiroWhatsapp, `${clienteId}:responsavelFinanceiroWhatsapp`)
  const whatsappFinanceiro = normalizePhone(data.whatsappFinanceiro, `${clienteId}:whatsappFinanceiro`)
  const whatsappPrincipal = normalizePhone(data.whatsapp, `${clienteId}:whatsapp`)

  if (data.responsavelFinanceiroPreferencial && financeiroWhatsapp) {
    return {
      clienteId,
      contatoNome: (data.responsavelFinanceiroNome as string | undefined) ?? (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: financeiroWhatsapp,
      contatoOrigem: 'responsavel_financeiro',
    }
  }
  if (financeiroWhatsapp) {
    return {
      clienteId,
      contatoNome: (data.responsavelFinanceiroNome as string | undefined) ?? (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: financeiroWhatsapp,
      contatoOrigem: 'responsavel_financeiro',
    }
  }
  if (whatsappFinanceiro) {
    return {
      clienteId,
      contatoNome: (data.responsavelFinanceiroNome as string | undefined) ?? (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: whatsappFinanceiro,
      contatoOrigem: 'whatsapp_financeiro',
    }
  }
  if (whatsappPrincipal) {
    return {
      clienteId,
      contatoNome: (data.razaoSocial as string | undefined) ?? 'Cliente',
      contatoTelefone: whatsappPrincipal,
      contatoOrigem: 'cliente',
    }
  }
  return null
}

/** Palavras que, sozinhas em qualquer ponto da frase, valem como pedido de saída. */
const PALAVRAS_OPT_OUT = [
  'pare', 'parem', 'parar', 'sair', 'saia', 'cancelar', 'cancela', 'cancele',
  'descadastrar', 'descadastre', 'remover', 'remova', 'stop', 'unsubscribe',
]

const FRASES_OPT_OUT = [
  'nao quero mais receber',
  'nao quero receber',
  'nao envie mais',
  'nao me envie',
  'nao mande mais',
  'pare de enviar',
  'pare de mandar',
  'me tire da lista',
  'me tira da lista',
  'sair da lista',
  'me remova',
  'me descadastre',
]

function normalizarTextoRecebido(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Reconhece pedido de opt-out tolerando acento, caixa e pontuação
 * ("PARE!", "Não quero mais receber.", "cancelar").
 * Preferimos o falso positivo: parar de cobrar alguém por engano é reversível
 * pelo escritório; continuar cobrando quem pediu para parar é o motivo nº 1 de
 * bloqueio do número pela Meta.
 */
export function isPedidoOptOut(texto: unknown): boolean {
  const normalizado = normalizarTextoRecebido(texto)
  if (!normalizado) return false
  const tokens = normalizado.split(' ')
  if (PALAVRAS_OPT_OUT.some((palavra) => tokens.includes(palavra))) return true
  return FRASES_OPT_OUT.some((frase) => normalizado.includes(frase))
}

/**
 * Bloqueio no nível do NÚMERO. Existe além do flag no cliente porque nem todo
 * inbound é identificável (número que não bate com nenhum cadastro) e porque um
 * mesmo telefone pode responder por mais de um cliente.
 */
export async function isNumeroOptOut(telefone: unknown): Promise<boolean> {
  const digits = normalizePhone(telefone)
  if (!digits) return false
  const snap = await db().collection('whatsapp_optouts').doc(digits).get()
  return snap.exists && snap.data()?.ativo !== false
}

/**
 * Casa o número que respondeu com um cliente. Os telefones são gravados
 * formatados ("+55 (11) 98765-4321"), então não dá para consultar por
 * igualdade no Firestore: varremos o tenant (119 clientes) e comparamos
 * normalizado. Inbound é raro — o custo é irrelevante perto de perder um
 * "PARE".
 */
export async function findClienteByWhatsapp(telefone: string, tenantId = DEFAULT_TENANT_ID) {
  const alvo = chaveComparavelTelefone(normalizePhone(telefone))
  if (!alvo) return null

  const snap = await db().collection('clientes').where('tenantId', '==', tenantId).get()
  for (const doc of snap.docs) {
    const data = doc.data() ?? {}
    const candidatos = [data.responsavelFinanceiroWhatsapp, data.whatsappFinanceiro, data.whatsapp]
    if (candidatos.some((valor) => chaveComparavelTelefone(normalizePhone(valor)) === alvo)) {
      return { id: doc.id, data }
    }
  }
  return null
}

/** Jobs que ainda podem virar mensagem — os únicos que faz sentido cancelar. */
const STATUS_JOB_CANCELAVEIS = ['agendado', 'falhou', 'aguardando_aprovacao']

/**
 * Cancela os jobs que ainda podem disparar para um cliente.
 * Filtra por status em memória (só igualdade por clienteId na query) para não
 * exigir índice composto novo em `whatsapp_jobs` — mesma restrição já
 * documentada no scheduler.
 */
async function cancelarJobsPendentesDoCliente(clienteId: string, motivo: string): Promise<number> {
  const snap = await db().collection('whatsapp_jobs').where('clienteId', '==', clienteId).limit(200).get()
  const pendentes = snap.docs.filter((doc) => STATUS_JOB_CANCELAVEIS.includes(String(doc.data().status ?? '')))
  if (!pendentes.length) return 0

  const batch = db().batch()
  for (const doc of pendentes) {
    batch.set(doc.ref, {
      status: 'cancelado',
      motivoCancelamento: motivo,
      canceladoEm: FieldValue.serverTimestamp(),
      nextRetryAt: null,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    const lancamentoId = doc.data().lancamentoId
    if (lancamentoId) {
      batch.set(db().collection('lancamentos').doc(String(lancamentoId)), {
        statusWhatsappCobranca: 'nao_agendado',
        proximaAcaoWhatsappEm: null,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  }
  await batch.commit()
  return pendentes.length
}

/**
 * Registra uma mensagem RECEBIDA. Vai para `whatsapp_messages` com
 * `direcao: 'inbound'` (em vez de uma coleção nova) para aparecer no histórico
 * do lançamento que a UI já lê — antes desta correção a resposta do cliente
 * simplesmente sumia.
 */
export async function registrarMensagemRecebida(params: {
  tenantId: string
  clienteId?: string | null
  telefone: string
  texto: string
  providerMessageId?: string | null
  respostaDe?: string | null
  optOut: boolean
}) {
  // Amarra a resposta a um lançamento para ela aparecer no histórico financeiro.
  let lancamentoId: string | null = null

  // Caso exato: o cliente respondeu "citando" a cobrança original.
  if (params.respostaDe) {
    const original = await db()
      .collection('whatsapp_messages')
      .where('providerMessageId', '==', params.respostaDe)
      .limit(1)
      .get()
    const vinculo = original.empty ? null : original.docs[0].data().lancamentoId
    lancamentoId = vinculo ? String(vinculo) : null
  }

  // Best-effort: sem citação, usamos a última cobrança enviada para o número.
  // Sem orderBy porque ordenar por `criadoEm` exigiria um índice composto novo
  // em `whatsapp_messages` (firestore.indexes.json é de outro agente) — com mais
  // de 20 mensagens o vínculo pode não ser o mais recente, mas a mensagem
  // recebida é gravada de qualquer forma. Nunca se perde.
  if (!lancamentoId && params.telefone) {
    const ultimoEnvio = await db()
      .collection('whatsapp_messages')
      .where('contatoDestino', '==', params.telefone)
      .limit(20)
      .get()
    const maisRecente = ultimoEnvio.docs
      .filter((doc) => doc.data().direcao !== 'inbound' && doc.data().lancamentoId)
      .sort((a, b) => (b.data().criadoEm?.toMillis?.() ?? 0) - (a.data().criadoEm?.toMillis?.() ?? 0))[0]
    lancamentoId = maisRecente ? String(maisRecente.data().lancamentoId) : null
  }

  const ref = db().collection('whatsapp_messages').doc()
  await ref.set({
    tenantId: params.tenantId,
    clienteId: params.clienteId ?? null,
    lancamentoId,
    jobId: null,
    direcao: 'inbound',
    templateKey: null,
    etapa: null,
    status: 'respondido',
    optOut: params.optOut,
    providerMessageId: params.providerMessageId ?? null,
    respostaDe: params.respostaDe ?? null,
    // O texto do cliente é o conteúdo do registro: guardamos sanitizado
    // (o redator remove CPF/CNPJ/telefone/e-mail que ele tenha digitado).
    textoRecebido: sanitizeAuditString(String(params.texto ?? '')),
    payloadResumo: null,
    responseResumo: null,
    erro: null,
    detalhes: null,
    contatoDestino: params.telefone,
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  })
  return { messageId: ref.id, lancamentoId }
}

/**
 * Aplica o opt-out: revoga o consentimento no cadastro, bloqueia o número e
 * mata os jobs que já estavam na fila para ele.
 */
export async function aplicarOptOutWhatsapp(params: {
  tenantId: string
  telefone: string
  clienteId?: string | null
  texto: string
  providerMessageId?: string | null
}) {
  const motivo = 'Opt-out solicitado pelo cliente no WhatsApp.'

  if (params.telefone) {
    await db().collection('whatsapp_optouts').doc(params.telefone).set({
      tenantId: params.tenantId,
      telefone: params.telefone,
      clienteId: params.clienteId ?? null,
      ativo: true,
      origem: 'inbound_whatsapp',
      mensagem: sanitizeAuditString(String(params.texto ?? '')),
      providerMessageId: params.providerMessageId ?? null,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  let jobsCancelados = 0
  if (params.clienteId) {
    await db().collection('clientes').doc(params.clienteId).set({
      aceiteWhatsAppCobranca: false,
      aceiteWhatsAppCobrancaOrigem: 'opt_out_whatsapp',
      whatsappCobrancaPausado: true,
      whatsappCobrancaPausadoMotivo: motivo,
      whatsappCobrancaPausadoEm: FieldValue.serverTimestamp(),
      whatsappCobrancaPausadoPor: 'cliente_whatsapp',
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    jobsCancelados = await cancelarJobsPendentesDoCliente(params.clienteId, motivo)

    await db().collection('events').add({
      tenantId: params.tenantId,
      clienteId: params.clienteId,
      tipo: 'whatsapp_opt_out',
      titulo: 'Cliente pediu para não receber cobranças no WhatsApp',
      descricao: `Consentimento revogado. ${jobsCancelados} envio(s) pendente(s) cancelado(s).`,
      metadata: redactAuditData({ telefone: params.telefone, jobsCancelados }),
      criadoEm: FieldValue.serverTimestamp(),
    })
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actor: SYSTEM_ACTOR,
    entidade: 'clientes',
    entidadeId: params.clienteId ?? null,
    acao: 'opt_out_whatsapp',
    dadosAntes: null,
    dadosDepois: { motivo, telefone: params.telefone, jobsCancelados, identificado: Boolean(params.clienteId) },
    origem: 'cloud_function',
  })

  return { jobsCancelados }
}

/** Deslocamento em dias da etapa: negativo antes do vencimento, positivo depois. */
function offsetDaRegra(rule: WhatsappCampaignRule): number | null {
  if (typeof rule.diasAntes === 'number') return -rule.diasAntes
  if (typeof rule.diasDepois === 'number') return rule.diasDepois
  return null
}

/**
 * Etapa do disparo MANUAL.
 * ARMADILHA: antes disso o manual usava `rules[0]`, e `rules` vem ordenado por
 * prioridade — ou seja, sempre o D-7. Uma fatura 45 dias vencida recebia "sua
 * mensalidade vence em 7 dias". Aqui pegamos a última etapa que a data real já
 * ultrapassou (nunca uma etapa futura, para não inventar urgência) e devolvemos
 * null quando nenhuma se aplica.
 */
function resolverEtapaManual(rules: WhatsappCampaignRule[], dayDiff: number): WhatsappCampaignRule | undefined {
  return rules
    .filter((rule) => {
      const offset = offsetDaRegra(rule)
      return offset !== null && offset <= dayDiff
    })
    .sort((a, b) => (offsetDaRegra(a) ?? 0) - (offsetDaRegra(b) ?? 0))
    .pop()
}

export async function evaluateLancamentoEligibility(
  lancamentoId: string,
  opts?: { manual?: boolean }
): Promise<EligibilityResult> {
  const lancamentoSnap = await db().collection('lancamentos').doc(lancamentoId).get()
  if (!lancamentoSnap.exists) return { eligible: false, reason: 'Lançamento não encontrado.' }
  const lancamento = { id: lancamentoSnap.id, ...(lancamentoSnap.data() ?? {}) } as LancamentoDoc

  if (!lancamento.clienteId) return { eligible: false, reason: 'Lançamento sem cliente vinculado.' }
  if (lancamento.tipo !== 'receita') return { eligible: false, reason: 'Somente receitas entram na régua.' }
  if (!['pendente', 'atrasado'].includes(String(lancamento.status ?? ''))) return { eligible: false, reason: 'Status financeiro inelegível.' }
  if (lancamento.cobrancaWhatsappEnabled === false || lancamento.whatsappCobrancaIgnorada) {
    return { eligible: false, reason: 'Cobrança WhatsApp desativada para este lançamento.' }
  }
  if (lancamento.whatsappCobrancaPausada) return { eligible: false, reason: 'Régua pausada manualmente.' }
  if (lancamento.dataPagamento) return { eligible: false, reason: 'Lançamento já pago.' }

  const clienteSnap = await db().collection('clientes').doc(lancamento.clienteId).get()
  if (!clienteSnap.exists) return { eligible: false, reason: 'Cliente não encontrado.' }
  const cliente = clienteSnap.data() ?? {}
  if (cliente.status !== 'ativo') return { eligible: false, reason: 'Cliente inativo.' }
  if (!cliente.aceiteWhatsAppCobranca) return { eligible: false, reason: 'Cliente sem consentimento para cobrança via WhatsApp.' }
  if (cliente.whatsappCobrancaPausado) return { eligible: false, reason: 'Cobrança pausada no cadastro do cliente.' }

  const target = await resolveBillingTarget(lancamento.clienteId)
  if (!target) return { eligible: false, reason: 'Cliente sem WhatsApp financeiro válido.' }
  if (await isNumeroOptOut(target.contatoTelefone)) {
    return { eligible: false, reason: 'Número pediu opt-out no WhatsApp.' }
  }

  const rules = await getWhatsappRules(String(cliente.tenantId ?? DEFAULT_TENANT_ID))
  const vencimento = lancamento.dataVencimento?.toDate()
  if (!vencimento) return { eligible: false, reason: 'Lançamento sem vencimento.' }

  const baseDate = new Date()
  const dayDiff = differenceInCalendarDays(baseDate, vencimento)
  const matchedRule = opts?.manual
    ? resolverEtapaManual(rules, dayDiff)
    : rules.find((rule) => {
        if (typeof rule.diasAntes === 'number') return dayDiff === -rule.diasAntes
        if (typeof rule.diasDepois === 'number') return dayDiff === rule.diasDepois
        return false
      })

  if (!matchedRule) {
    return {
      eligible: false,
      reason: opts?.manual
        ? 'Nenhuma etapa da régua se aplica à data deste lançamento — o vencimento ainda está distante demais.'
        : 'Nenhuma etapa da régua ativa para esta data.',
    }
  }

  const existingJobKey = buildJobKey(lancamento.id ?? lancamentoId, matchedRule.etapa, baseDate)
  const existingJob = await db().collection('whatsapp_jobs').doc(existingJobKey).get()
  if (existingJob.exists && !opts?.manual) return { eligible: false, reason: 'Job já criado para esta etapa/base.' }

  const config = await getTenantWhatsappConfig(String(cliente.tenantId ?? DEFAULT_TENANT_ID))
  // Já nasce dentro da janela do escritório: se a régua rodar às 22h, o job
  // fica agendado para a próxima abertura em vez de sair de madrugada.
  const janela = resolverJanelaEnvio(baseDate, {
    horaMinima: matchedRule.horaMinima || config.whatsappJanelaHoraMinima,
    horaMaxima: matchedRule.horaMaxima || config.whatsappJanelaHoraMaxima,
    usarDiasUteis: matchedRule.usarDiasUteis ?? config.whatsappUsaDiasUteis,
  })
  return { eligible: true, target, rule: matchedRule, etapa: matchedRule.etapa, scheduledFor: janela.proximo }
}

export function buildJobKey(lancamentoId: string, etapa: string, dateBase: Date) {
  // A chave é o "dia da régua" em Brasília — se usasse o calendário do processo
  // (UTC), tudo depois das 21h viraria o dia seguinte e a deduplicação de etapa
  // deixaria passar um segundo envio.
  const partes = partesEscritorio(dateBase)
  const base = `${partes.ano}${String(partes.mes).padStart(2, '0')}${String(partes.dia).padStart(2, '0')}`
  return `${lancamentoId}_${etapa}_${base}`
}

export async function queueWhatsappJob(lancamentoId: string, opts?: { manual?: boolean }) {
  const eligibility = await evaluateLancamentoEligibility(lancamentoId, opts)
  if (!eligibility.eligible || !eligibility.target || !eligibility.rule || !eligibility.etapa || !eligibility.scheduledFor) {
    throw new HttpsError('failed-precondition', eligibility.reason ?? 'Lançamento inelegível.')
  }

  const lancamentoSnap = await db().collection('lancamentos').doc(lancamentoId).get()
  const lancamento = lancamentoSnap.data() as LancamentoDoc | undefined
  if (!lancamento?.clienteId) throw new HttpsError('failed-precondition', 'Lançamento sem cliente.')

  const clienteSnap = await db().collection('clientes').doc(lancamento.clienteId).get()
  const tenantId = String(clienteSnap.data()?.tenantId ?? DEFAULT_TENANT_ID)
  // A chave usa o dia de HOJE, não o `scheduledFor`: quando o envio é adiado
  // para a próxima abertura da janela, as duas datas divergem, e a chave
  // precisa ser a mesma que `evaluateLancamentoEligibility` consultou para
  // deduplicar a etapa — caso contrário o mesmo D0 seria enfileirado de novo.
  const jobKey = buildJobKey(lancamentoId, eligibility.etapa, new Date())
  const payloadResumo = {
    clienteNome: clienteSnap.data()?.razaoSocial ?? lancamento.clienteNome ?? '',
    servico: lancamento.descricao ?? 'Mensalidade',
    valor: Number(lancamento.valor ?? 0).toFixed(2),
    vencimento: lancamento.dataVencimento?.toDate().toLocaleDateString('pt-BR', { timeZone: TIMEZONE_ESCRITORIO }),
  }

  await db().collection('whatsapp_jobs').doc(jobKey).set({
    tenantId,
    jobKey,
    clienteId: lancamento.clienteId,
    lancamentoId,
    messageId: null,
    etapa: eligibility.etapa,
    status: 'agendado',
    scheduledFor: admin.firestore.Timestamp.fromDate(eligibility.scheduledFor),
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    erro: null,
    detalhes: null,
    contatoDestino: eligibility.target.contatoTelefone,
    payloadResumo,
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db().collection('lancamentos').doc(lancamentoId).set({
    statusWhatsappCobranca: 'agendado',
    proximaAcaoWhatsappEm: admin.firestore.Timestamp.fromDate(eligibility.scheduledFor),
    etapaWhatsappAtual: eligibility.etapa,
    pagadorNome: lancamento.pagadorNome ?? eligibility.target.contatoNome,
    pagadorWhatsapp: lancamento.pagadorWhatsapp ?? eligibility.target.contatoTelefone,
    cobrancaWhatsappEnabled: true,
    whatsappCobrancaExigeAprovacao: eligibility.rule.exigeAprovacao,
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  return { jobKey, etapa: eligibility.etapa, scheduledFor: eligibility.scheduledFor }
}

async function buildMessagePayload(job: FirebaseFirestore.DocumentData, fromNumber: string) {
  const templateSnap = await db()
    .collection('whatsapp_templates')
    .where('tenantId', '==', job.tenantId)
    .get()
  const templateKey = mapEtapaToTemplate(String(job.etapa))
  const template = templateSnap.docs
    .map((doc) => doc.data())
    .find((doc) => doc.templateKey === templateKey) ?? {}

  const contentSid = String(template.providerContentSid ?? '')
  if (!contentSid) {
    throw new HttpsError('failed-precondition', `Template "${templateKey}" sem ContentSid da Twilio configurado no catálogo.`)
  }

  return {
    to: `whatsapp:+${String(job.contatoDestino)}`,
    from: `whatsapp:${fromNumber}`,
    contentSid,
    contentVariables: JSON.stringify({
      '1': String(job.payloadResumo?.clienteNome ?? ''),
      '2': String(job.payloadResumo?.servico ?? ''),
      '3': String(job.payloadResumo?.valor ?? ''),
      '4': String(job.payloadResumo?.vencimento ?? ''),
    }),
  }
}

function mapEtapaToTemplate(etapa: string) {
  switch (etapa) {
    case 'D-7': return 'cobranca_pre_vencimento_7'
    case 'D-3': return 'cobranca_pre_vencimento_3'
    case 'D0': return 'cobranca_vencimento_hoje'
    case 'D+3': return 'cobranca_atraso_leve'
    case 'D+7': return 'cobranca_atraso_critico'
    default: return 'cobranca_pre_vencimento_3'
  }
}

type VeredictoDespacho =
  | { acao: 'enviar'; contatoDestino: string; config: WhatsappTenantConfig }
  | { acao: 'cancelar'; motivo: string }
  | { acao: 'adiar'; motivo: string; proximo: Date }
  | { acao: 'aguardar_aprovacao'; motivo: string }

/**
 * Reavalia a cobrança no INSTANTE do envio.
 *
 * ARMADILHA: a elegibilidade só era conferida no enqueue. O job D+3 nasce às
 * 00:10, o cliente paga às 07:00, o escritório dá baixa às 07:30 e às 08:00 saía
 * "sua mensalidade está em atraso". Pausar a régua também só marcava o
 * lançamento, sem tocar em `whatsapp_jobs`. Nada aqui é falha de provider —
 * por isso o veredicto é cancelar/adiar, nunca retentar.
 */
async function revalidarJobAntesDoEnvio(job: FirebaseFirestore.DocumentData, origem: 'fila' | 'manual'): Promise<VeredictoDespacho> {
  const lancamentoId = String(job.lancamentoId ?? '')
  if (!lancamentoId) return { acao: 'cancelar', motivo: 'Job sem lançamento vinculado.' }

  const lancamentoSnap = await db().collection('lancamentos').doc(lancamentoId).get()
  if (!lancamentoSnap.exists) return { acao: 'cancelar', motivo: 'Lançamento não existe mais.' }
  const lancamento = lancamentoSnap.data() as LancamentoDoc

  if (lancamento.dataPagamento) return { acao: 'cancelar', motivo: 'Lançamento já foi baixado — cobrança cancelada.' }
  if (lancamento.tipo !== 'receita') return { acao: 'cancelar', motivo: 'Somente receitas entram na régua.' }
  if (!['pendente', 'atrasado'].includes(String(lancamento.status ?? ''))) {
    return { acao: 'cancelar', motivo: `Status financeiro "${lancamento.status ?? 'indefinido'}" não é mais cobrável.` }
  }
  if (lancamento.whatsappCobrancaPausada) return { acao: 'cancelar', motivo: 'Régua pausada para este lançamento.' }
  if (lancamento.cobrancaWhatsappEnabled === false || lancamento.whatsappCobrancaIgnorada) {
    return { acao: 'cancelar', motivo: 'Cobrança WhatsApp desativada para este lançamento.' }
  }

  const clienteId = String(job.clienteId ?? lancamento.clienteId ?? '')
  if (!clienteId) return { acao: 'cancelar', motivo: 'Lançamento sem cliente vinculado.' }
  const clienteSnap = await db().collection('clientes').doc(clienteId).get()
  if (!clienteSnap.exists) return { acao: 'cancelar', motivo: 'Cliente não encontrado.' }
  const cliente = clienteSnap.data() ?? {}
  if (cliente.status !== 'ativo') return { acao: 'cancelar', motivo: 'Cliente inativo.' }
  if (!cliente.aceiteWhatsAppCobranca) return { acao: 'cancelar', motivo: 'Cliente sem consentimento para cobrança via WhatsApp.' }
  if (cliente.whatsappCobrancaPausado) return { acao: 'cancelar', motivo: 'Cobrança pausada no cadastro do cliente.' }

  // O contato pode ter sido corrigido depois do agendamento — e jobs antigos
  // podem carregar um número normalizado errado. Vale o cadastro de agora.
  const target = await resolveBillingTarget(clienteId)
  if (!target) return { acao: 'cancelar', motivo: 'Cliente sem WhatsApp financeiro válido.' }
  if (await isNumeroOptOut(target.contatoTelefone)) {
    return { acao: 'cancelar', motivo: 'Número pediu opt-out no WhatsApp.' }
  }

  const tenantId = String(job.tenantId ?? cliente.tenantId ?? DEFAULT_TENANT_ID)
  const rules = await getWhatsappRules(tenantId)
  const rule = rules.find((item) => item.etapa === job.etapa)
  if (!rule) return { acao: 'cancelar', motivo: `Etapa "${job.etapa}" não está mais ativa na régua.` }

  // P1-7: a etapa mais agressiva (D+7) é marcada como exigeAprovacao e o campo
  // nunca era lido. Pela fila ela fica retida; o disparo manual É a aprovação.
  if (rule.exigeAprovacao && origem === 'fila' && !job.aprovadoPor) {
    return { acao: 'aguardar_aprovacao', motivo: `Etapa ${rule.etapa} exige aprovação — não é despachada automaticamente.` }
  }

  const config = await getTenantWhatsappConfig(tenantId)
  const janela = resolverJanelaEnvio(new Date(), {
    horaMinima: rule.horaMinima || config.whatsappJanelaHoraMinima,
    horaMaxima: rule.horaMaxima || config.whatsappJanelaHoraMaxima,
    usarDiasUteis: rule.usarDiasUteis ?? config.whatsappUsaDiasUteis,
  })
  if (!janela.dentroDaJanela) {
    return { acao: 'adiar', motivo: janela.motivo ?? 'Fora da janela de envio.', proximo: janela.proximo }
  }

  return { acao: 'enviar', contatoDestino: target.contatoTelefone, config }
}

/** Persiste o desfecho de um job que NÃO virou mensagem agora. */
async function registrarNaoEnvio(jobId: string, job: FirebaseFirestore.DocumentData, veredicto: Exclude<VeredictoDespacho, { acao: 'enviar' }>) {
  const jobRef = db().collection('whatsapp_jobs').doc(jobId)
  // Um dos motivos de cancelamento é justamente "lançamento não existe mais":
  // gravar com merge nesse caso RESSUSCITARIA o documento apagado, só com os
  // campos de WhatsApp. Confirmamos a existência antes de tocar nele.
  const lancamentoCandidato = job.lancamentoId ? db().collection('lancamentos').doc(String(job.lancamentoId)) : null
  const lancamentoRef = lancamentoCandidato && (await lancamentoCandidato.get()).exists ? lancamentoCandidato : null

  if (veredicto.acao === 'adiar') {
    await jobRef.set({
      // Um job que já estava em 'falhou' continua em 'falhou': voltar para
      // 'agendado' o tiraria da contagem de tentativas e ele nunca esgotaria.
      status: String(job.status ?? '') === 'falhou' ? 'falhou' : 'agendado',
      scheduledFor: admin.firestore.Timestamp.fromDate(veredicto.proximo),
      nextRetryAt: admin.firestore.Timestamp.fromDate(veredicto.proximo),
      detalhes: veredicto.motivo,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (lancamentoRef) {
      await lancamentoRef.set({
        proximaAcaoWhatsappEm: admin.firestore.Timestamp.fromDate(veredicto.proximo),
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    return
  }

  if (veredicto.acao === 'aguardar_aprovacao') {
    await jobRef.set({
      status: 'aguardando_aprovacao',
      nextRetryAt: null,
      detalhes: veredicto.motivo,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (lancamentoRef) {
      await lancamentoRef.set({
        whatsappCobrancaAguardandoAprovacao: true,
        whatsappCobrancaExigeAprovacao: true,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  } else {
    await jobRef.set({
      status: 'cancelado',
      motivoCancelamento: veredicto.motivo,
      canceladoEm: FieldValue.serverTimestamp(),
      nextRetryAt: null,
      detalhes: veredicto.motivo,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (lancamentoRef) {
      // 'cancelado' não existe em WhatsappStatus (tipo compartilhado com a UI):
      // o lançamento volta para 'nao_agendado', que é o que de fato descreve o
      // estado — não há mais envio previsto.
      await lancamentoRef.set({
        statusWhatsappCobranca: 'nao_agendado',
        proximaAcaoWhatsappEm: null,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  }

  await db().collection('events').add({
    tenantId: job.tenantId ?? DEFAULT_TENANT_ID,
    clienteId: job.clienteId ?? null,
    tipo: veredicto.acao === 'cancelar' ? 'whatsapp_cobranca_cancelada' : 'whatsapp_cobranca_retida',
    titulo: veredicto.acao === 'cancelar' ? `Cobrança WhatsApp ${job.etapa} cancelada` : `Cobrança WhatsApp ${job.etapa} aguardando aprovação`,
    descricao: veredicto.motivo,
    metadata: redactAuditData({ jobId, etapa: job.etapa }),
    criadoEm: FieldValue.serverTimestamp(),
  })
}

export async function dispatchWhatsappJob(jobId: string, opts?: { origem?: 'fila' | 'manual' }) {
  // Sem `origem` explícita tratamos como manual: o único chamador que não passa
  // nada é o callable "disparar agora", acionado por um humano autenticado.
  const origem = opts?.origem ?? 'manual'
  const jobSnap = await db().collection('whatsapp_jobs').doc(jobId).get()
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job não encontrado.')
  const job = jobSnap.data() ?? {}

  let veredicto: VeredictoDespacho
  try {
    veredicto = await revalidarJobAntesDoEnvio(job, origem)
  } catch (error) {
    // Fail-closed: se não deu para confirmar que a cobrança ainda é devida,
    // adiamos. Enviar "no escuro" é o erro caro; esperar 30 min não é.
    console.error('[whatsapp][revalidacao-falhou]', JSON.stringify({ jobId, erro: String((error as Error)?.message ?? error) }))
    veredicto = { acao: 'adiar', motivo: 'Não foi possível revalidar a cobrança agora — envio adiado.', proximo: new Date(Date.now() + 30 * 60 * 1000) }
  }

  if (veredicto.acao !== 'enviar') {
    await registrarNaoEnvio(jobId, job, veredicto)
    // No disparo manual o operador precisa ver o motivo; pela fila devolvemos o
    // desfecho sem lançar, para o scheduler não sobrescrever com 'falhou'.
    if (origem === 'manual') throw new HttpsError('failed-precondition', veredicto.motivo)
    return { messageId: null, providerMessageId: null, status: veredicto.acao }
  }

  const config = veredicto.config
  const jobParaEnvio = { ...job, contatoDestino: veredicto.contatoDestino }

  // Todo o caminho de dispatch (pré-condições, montagem e envio) fica dentro do
  // try para que QUALQUER falha — inclusive Cloud API desabilitada ou token/phone
  // ausente — seja registrada com nextRetryAt/attemptCount e progrida até
  // 'esgotado' na fila, em vez de virar um job 'falhou' preso sem retry.
  try {
    if (!config.whatsappCloudApiEnabled) {
      throw new HttpsError('failed-precondition', 'Canal de WhatsApp desabilitado nos parâmetros.')
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = config.whatsappTwilioFromNumber
    if (!accountSid || !authToken || !fromNumber) {
      throw new HttpsError('failed-precondition', 'Credenciais ou número Twilio não configurados.')
    }

    const messagePayload = await buildMessagePayload(jobParaEnvio, fromNumber)
    const client = twilio(accountSid, authToken)
    const response = await client.messages.create(messagePayload)
    const providerMessageId = response.sid ?? null
    const messageRef = db().collection('whatsapp_messages').doc()

    await messageRef.set({
      tenantId: job.tenantId,
      clienteId: job.clienteId,
      lancamentoId: job.lancamentoId,
      jobId,
      templateKey: mapEtapaToTemplate(String(job.etapa)),
      etapa: job.etapa,
      status: 'enviado',
      providerMessageId,
      payloadResumo: redactAuditData(messagePayload),
      responseResumo: redactAuditData({ sid: response.sid, status: response.status, errorCode: response.errorCode, errorMessage: response.errorMessage }),
      erro: null,
      detalhes: null,
      direcao: 'outbound',
      contatoDestino: jobParaEnvio.contatoDestino,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    })

    await db().collection('whatsapp_jobs').doc(jobId).set({
      status: 'enviado',
      messageId: messageRef.id,
      contatoDestino: jobParaEnvio.contatoDestino,
      attemptCount: FieldValue.increment(1),
      lastAttemptAt: FieldValue.serverTimestamp(),
      erro: null,
      detalhes: null,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })

    await db().collection('lancamentos').doc(String(job.lancamentoId)).set({
      statusWhatsappCobranca: 'enviado',
      ultimoEnvioWhatsappEm: FieldValue.serverTimestamp(),
      ultimaMensagemWhatsappId: messageRef.id,
      etapaWhatsappAtual: job.etapa,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })

    await db().collection('events').add({
      tenantId: job.tenantId,
      clienteId: job.clienteId,
      tipo: 'whatsapp_cobranca_enviado',
      titulo: `Cobrança WhatsApp ${job.etapa}`,
      descricao: `Mensagem enviada para ${jobParaEnvio.contatoDestino}.`,
      metadata: redactAuditData({ etapa: job.etapa, providerMessageId }),
      criadoEm: FieldValue.serverTimestamp(),
    })

    await writeAuditLog({
      tenantId: String(job.tenantId),
      actor: SYSTEM_ACTOR,
      entidade: 'whatsapp_messages',
      entidadeId: messageRef.id,
      acao: 'send',
      dadosAntes: null,
      dadosDepois: { jobId, etapa: job.etapa, contatoDestino: jobParaEnvio.contatoDestino },
      origem: 'cloud_function',
    })

    return { messageId: messageRef.id, providerMessageId, status: 'enviado' as const }
  } catch (error) {
    const twilioError = error as { code?: number; message?: string; status?: number; moreInfo?: string }
    const details = redactAuditData({ code: twilioError.code, status: twilioError.status, moreInfo: twilioError.moreInfo, message: twilioError.message })
    await db().collection('whatsapp_jobs').doc(jobId).set({
      status: 'falhou',
      attemptCount: FieldValue.increment(1),
      lastAttemptAt: FieldValue.serverTimestamp(),
      nextRetryAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
      erro: twilioError.message ?? 'Falha ao enviar mensagem pelo provider.',
      detalhes: details,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (job.lancamentoId) {
      await db().collection('lancamentos').doc(String(job.lancamentoId)).set({
        statusWhatsappCobranca: 'falhou',
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    // Preserva o motivo real (ex.: pré-condição de config) em vez de mascarar tudo
    // como erro de provider — a fila registra nextRetryAt/attemptCount de qualquer forma.
    throw error instanceof HttpsError ? error : new HttpsError('internal', 'Falha ao enviar mensagem pelo provider.')
  }
}

export async function processWebhookStatus(providerMessageId: string, eventType: string, payload: unknown) {
  const snap = await db().collection('whatsapp_messages').where('providerMessageId', '==', providerMessageId).limit(1).get()
  if (snap.empty) return
  const messageRef = snap.docs[0].ref
  const message = snap.docs[0].data()
  const nextStatus =
    eventType === 'queued' || eventType === 'sent' ? 'enviado' :
    eventType === 'delivered' ? 'entregue' :
    eventType === 'read' ? 'lido' :
    eventType === 'failed' || eventType === 'undelivered' ? 'falhou' :
    eventType === 'response' ? 'respondido' :
    message.status

  await messageRef.set({
    status: nextStatus,
    responseResumo: redactAuditData(payload),
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  if (message.lancamentoId) {
    await db().collection('lancamentos').doc(String(message.lancamentoId)).set({
      statusWhatsappCobranca: nextStatus,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  await db().collection('events').add({
    tenantId: message.tenantId,
    clienteId: message.clienteId,
    tipo: `whatsapp_${eventType}`,
    titulo: `WhatsApp ${eventType}`,
    descricao: `Mensagem ${providerMessageId} atualizada para ${nextStatus}.`,
    metadata: redactAuditData(payload),
    criadoEm: FieldValue.serverTimestamp(),
  })
}
