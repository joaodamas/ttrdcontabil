/**
 * Interpretação de um evento de webhook da Spedy — lógica PURA: sem Firestore,
 * sem rede, sem firebase-functions. Mora separada de spedy.ts e de
 * webhook-spedy.ts pelo mesmo motivo de scheduler/recorrencia.ts: aqueles dois
 * importam o SDK no topo e não sobem num teste de unidade, e este é justamente
 * o código que decide se uma nota fiscal REAL vira 'emitida', 'cancelada' ou
 * 'rejeitada' no histórico. Teste em __tests__/lib/spedy-evento.test.ts.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export type StatusNfseLocal = 'emitida' | 'cancelada' | 'rejeitada' | 'processando' | 'erro'

/**
 * Índice `id da nota na Spedy → nota daqui`. O nome mora neste módulo, e não no
 * conector, porque o webhook também escreve nele: a coleção é o contrato entre
 * quem emite e quem recebe o evento, e um literal repetido nos dois lados
 * quebraria em silêncio no dia em que alguém renomeasse um deles.
 */
export const COLECAO_REGISTRO_SPEDY = 'nfse_spedy'

/**
 * Status da Spedy → status da nota aqui dentro.
 *
 * O default é 'erro' (desconhecido), NUNCA 'emitida': status novo ou renomeado no
 * lado da Spedy tem que virar "não sei", que o webhook trata sem mexer na nota,
 * e não um check verde em cima de uma nota que pode ter sido recusada.
 */
const STATUS_LOCAL: Record<string, StatusNfseLocal> = {
  authorized: 'emitida',
  cancelled: 'cancelada',
  canceled: 'cancelada',
  denied: 'rejeitada',
  rejected: 'rejeitada',
  failed: 'rejeitada',
  error: 'rejeitada',
  enqueued: 'processando',
  created: 'processando',
  received: 'processando',
  incontingent: 'processando',
  cancelling: 'processando',
  canceling: 'processando',
  processing: 'processando',
}

export function mapearStatusSpedy(status: string | undefined | null): StatusNfseLocal {
  if (typeof status !== 'string' || !status.trim()) return 'erro'
  return STATUS_LOCAL[status.trim().toLowerCase()] ?? 'erro'
}

/** Status terminal = não muda mais sozinho; é o que autoriza fechar o ciclo. */
export function ehStatusTerminal(status: StatusNfseLocal): boolean {
  return status === 'emitida' || status === 'cancelada' || status === 'rejeitada'
}

// ─── Recursos da Spedy ────────────────────────────────────────────────────────
export type RecursoSpedy = 'service-invoices' | 'product-invoices' | 'consumer-invoices'

const RECURSOS: RecursoSpedy[] = ['service-invoices', 'product-invoices', 'consumer-invoices']

export function normalizarRecurso(valor: unknown): RecursoSpedy {
  const texto = String(valor ?? '').toLowerCase()
  const achado = RECURSOS.find((r) => texto.includes(r) || texto.includes(r.replace('-invoices', '')))
  // 'service-invoices' é o default porque é o único caminho em produção hoje;
  // errar o recurso só custa um 404 na releitura, não corrompe nota.
  return achado ?? 'service-invoices'
}

// ─── Números vindos de JSON ───────────────────────────────────────────────────
// A Spedy manda valor ora como número, ora como string ("1234.56"). String
// vazia, null e "abc" viram undefined — nunca 0: zero é um valor fiscal legítimo
// e gravar zero no lugar de "não veio" mente sobre o imposto da nota.
function numero(valor: unknown): number | undefined {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined
  if (typeof valor === 'string' && valor.trim()) {
    const n = Number(valor.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function texto(valor: unknown): string | undefined {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return undefined
}

function objeto(valor: unknown): Record<string, unknown> | undefined {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : undefined
}

// ─── IBS / CBS (reforma tributária) ───────────────────────────────────────────
/**
 * Valores de IBS/CBS que a Spedy CALCULA e devolve em `totals` — e que hoje a
 * plataforma joga fora. São eles que o contador precisa pra conferir a nota na
 * transição da reforma; recalcular por fora seria uma segunda fonte de verdade.
 *
 * As alíquotas (`*Rate`) chegam como fração (0.001 = 0,1%), igual ao issRate que
 * já mandamos na emissão — guardamos como vieram, sem converter para %, pra não
 * inventar precisão em cima de dado fiscal.
 */
export type TotaisIbsCbs = {
  ibsCbsBaseTax?: number
  ibsStateRate?: number
  ibsCityRate?: number
  cbsRate?: number
  ibsStateAmount?: number
  ibsCityAmount?: number
  ibsAmount?: number
  cbsAmount?: number
}

const CAMPOS_IBS_CBS: (keyof TotaisIbsCbs)[] = [
  'ibsCbsBaseTax',
  'ibsStateRate',
  'ibsCityRate',
  'cbsRate',
  'ibsStateAmount',
  'ibsCityAmount',
  'ibsAmount',
  'cbsAmount',
]

/**
 * Devolve `null` quando a nota não trouxe NENHUM campo de IBS/CBS — diferente de
 * devolver um objeto com tudo zerado. Nota antiga (pré-reforma) não tem esses
 * valores, e zerar seria afirmar que o imposto foi zero.
 */
export function extrairTotaisIbsCbs(nota: unknown): TotaisIbsCbs | null {
  const raiz = objeto(nota)
  if (!raiz) return null
  const fontes = [objeto(raiz.totals), objeto(raiz.total), objeto(raiz.taxes), raiz]

  const totais: TotaisIbsCbs = {}
  for (const campo of CAMPOS_IBS_CBS) {
    for (const fonte of fontes) {
      if (!fonte) continue
      const valor = numero(fonte[campo])
      if (valor !== undefined) {
        totais[campo] = valor
        break
      }
    }
  }
  return Object.keys(totais).length > 0 ? totais : null
}

// ─── Evento do webhook ────────────────────────────────────────────────────────
export type EventoSpedy = {
  invoiceId: string
  status?: string
  statusLocal: StatusNfseLocal
  integrationId?: string
  numeroNfse?: string
  protocolo?: string
  recurso: RecursoSpedy
  tipoEvento?: string
}

/**
 * Achata o corpo do POST da Spedy num evento nosso.
 *
 * O envelope não está fixado na doc pública (já apareceu tanto a nota crua
 * quanto `{ event, data }`), então aceitamos as formas conhecidas em vez de
 * apostar numa. Sem `id` da nota não há evento: devolve `null` e quem chama
 * responde 200 sem processar — reprocessar eternamente um POST que não dá pra
 * mapear só enche a fila de retry da Spedy.
 */
export function extrairEventoSpedy(body: unknown): EventoSpedy | null {
  const raiz = objeto(body)
  if (!raiz) return null

  const candidatos = [
    objeto(raiz.data),
    objeto(raiz.payload),
    objeto(raiz.invoice),
    objeto(raiz.serviceInvoice),
    objeto(raiz.resource),
    raiz,
  ]
  const nota = candidatos.find((c) => c && texto(c.id))
  if (!nota) return null

  const invoiceId = texto(nota.id)
  if (!invoiceId) return null

  const status = texto(nota.status) ?? texto(raiz.status)
  const autorizacao = objeto(nota.authorization)
  const tipoEvento = texto(raiz.event) ?? texto(raiz.eventType) ?? texto(raiz.type)

  return {
    invoiceId,
    status,
    statusLocal: mapearStatusSpedy(status),
    integrationId: texto(nota.integrationId) ?? texto(raiz.integrationId),
    numeroNfse: texto(nota.number) ?? texto(nota.numero),
    protocolo: texto(autorizacao?.protocol) ?? texto(nota.protocol),
    recurso: normalizarRecurso(
      texto(raiz.resource) ?? texto(raiz.resourceType) ?? texto(raiz.documentType) ?? tipoEvento,
    ),
    tipoEvento,
  }
}

/**
 * Chave de deduplicação do evento. A Spedy REENVIA o mesmo POST quando não
 * recebe 200 a tempo — sem esta chave, o mesmo `authorized` criaria duas notas
 * no histórico. Inclui o status porque a mesma nota manda vários eventos ao
 * longo do ciclo (created → authorized → cancelled), e todos precisam passar.
 */
export function chaveEventoWebhook(evento: { invoiceId: string; status?: string; tipoEvento?: string }): string {
  const partes = [evento.invoiceId, evento.status ?? evento.tipoEvento ?? 'sem_status']
  return partes
    .map((p) => String(p).replace(/[^A-Za-z0-9_-]/g, '_'))
    .join('__')
    .slice(0, 400)
}

// ─── Competência e caminho no Storage ─────────────────────────────────────────
export type Competencia = { ano: number; mes: number }

/**
 * Ano/mês usados no caminho do arquivo retido. Prefere a data da nota (é ela que
 * define a guarda de 5 anos) e só cai no relógio da máquina se a Spedy não
 * mandar data nenhuma — arquivo no mês errado ainda é melhor que arquivo perdido.
 */
export function competenciaDaNota(nota: unknown, agora: Date = new Date()): Competencia {
  const raiz = objeto(nota)
  const candidatos = [raiz?.issuedOn, raiz?.effectiveDate, raiz?.createdOn, raiz?.createdAt]
  for (const candidato of candidatos) {
    const iso = texto(candidato)
    if (!iso) continue
    const data = new Date(iso)
    if (!Number.isNaN(data.getTime())) {
      return { ano: data.getFullYear(), mes: data.getMonth() + 1 }
    }
  }
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 }
}

function segmentoSeguro(valor: string, campo: string): string {
  const limpo = String(valor).replace(/[^A-Za-z0-9_-]/g, '')
  if (!limpo) throw new Error(`Caminho de arquivo fiscal inválido: ${campo} vazio após sanitização.`)
  return limpo
}

/**
 * `nfse/{clienteId}/{ano}/{mes}/{nome}.{ext}` — o caminho que storage.rules já
 * conhece (a regra casa `nfse/{clienteId}/**` e libera leitura só pro tenant do
 * cliente). Sanitiza cada segmento: um `..` ou uma `/` vinda de um id
 * inesperado escreveria o XML de um cliente na pasta de outro.
 */
export function caminhoArquivoFiscal(params: {
  clienteId: string
  ano: number
  mes: number
  nome: string
  extensao: 'xml' | 'pdf'
}): string {
  const { clienteId, ano, mes, nome, extensao } = params
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error(`Ano inválido para caminho fiscal: ${ano}`)
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error(`Mês inválido para caminho fiscal: ${mes}`)
  const cliente = segmentoSeguro(clienteId, 'clienteId')
  const arquivo = segmentoSeguro(nome, 'nome')
  return `nfse/${cliente}/${ano}/${String(mes).padStart(2, '0')}/${arquivo}.${extensao}`
}

// ─── Autenticação do webhook ──────────────────────────────────────────────────
function igualdadeConstante(a: string, b: string): boolean {
  // Hash dos dois lados antes de comparar: timingSafeEqual exige buffers do
  // mesmo tamanho, e comparar tamanho antes já vazaria o tamanho do segredo.
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export type ResultadoCredencial = { ok: boolean; motivo?: 'segredo_nao_configurado' | 'credencial_ausente' | 'credencial_invalida' }

/**
 * Autentica o POST do webhook. FAIL-CLOSED em todos os caminhos, igual ao
 * webhook da Twilio (whatsapp/webhook.ts): sem segredo configurado, sem
 * credencial no request, ou credencial errada ⇒ recusa. É endpoint público —
 * quem passa daqui escreve número de nota fiscal no histórico do escritório.
 *
 * Dois formatos aceitos, nesta ordem:
 *  1. HMAC-SHA256 do corpo bruto em `x-spedy-signature` (aceita o prefixo
 *     `sha256=`). É o formato preferido: assina o CONTEÚDO, então um POST
 *     capturado não pode ser reaproveitado com outro corpo.
 *  2. Segredo compartilhado em header/query, para quando a Spedy não oferecer
 *     assinatura — é bearer puro, por isso só vale sobre HTTPS e com o segredo
 *     no Secret Manager.
 */
export function conferirCredencialWebhook(params: {
  segredo: string | undefined | null
  assinatura?: string | null
  token?: string | null
  corpoBruto?: Buffer | string | null
}): ResultadoCredencial {
  const segredo = typeof params.segredo === 'string' ? params.segredo.trim() : ''
  if (!segredo) return { ok: false, motivo: 'segredo_nao_configurado' }

  const assinatura = typeof params.assinatura === 'string' ? params.assinatura.trim() : ''
  if (assinatura) {
    if (params.corpoBruto == null) return { ok: false, motivo: 'credencial_invalida' }
    const recebida = assinatura.replace(/^sha256=/i, '').trim().toLowerCase()
    const esperada = createHmac('sha256', segredo)
      .update(typeof params.corpoBruto === 'string' ? Buffer.from(params.corpoBruto) : params.corpoBruto)
      .digest('hex')
    return igualdadeConstante(recebida, esperada) ? { ok: true } : { ok: false, motivo: 'credencial_invalida' }
  }

  const token = typeof params.token === 'string' ? params.token.trim() : ''
  if (!token) return { ok: false, motivo: 'credencial_ausente' }
  return igualdadeConstante(token, segredo) ? { ok: true } : { ok: false, motivo: 'credencial_invalida' }
}
