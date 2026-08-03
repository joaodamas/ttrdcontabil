#!/usr/bin/env node
/**
 * Cadastra (ou atualiza) o webhook de notas fiscais na Spedy.
 *
 * A Spedy não tem campo de segredo no cadastro de webhook — por isso o token
 * viaja na query string da URL, que é justamente um dos modos aceitos por
 * `conferirCredencialWebhook` (functions/src/nfse/provedores/spedy-evento.ts).
 *
 * É IDEMPOTENTE: lista os webhooks existentes antes e, se já houver um para o
 * mesmo evento, faz PUT em vez de criar outro. Rodar duas vezes não duplica.
 *
 * ── Como usar ────────────────────────────────────────────────────────────────
 *
 *   export SPEDY_API_KEY='...'          # chave da EMPRESA (não a Owner)
 *   export SPEDY_WEBHOOK_TOKEN='...'    # o MESMO valor do secret SPEDY_WEBHOOK_SECRET
 *
 *   node scripts/registrar-webhook-spedy.mjs --dry-run    # mostra o que faria
 *   node scripts/registrar-webhook-spedy.mjs              # aplica
 *   node scripts/registrar-webhook-spedy.mjs --listar     # só lista o que existe
 *
 * Opcionais:
 *   --stage            usa stage-api.spedy.com.br (Plano Desenvolvedor)
 *   --url=<url>        sobrescreve a URL da function
 *   --evento=<nome>    default invoice.status_changed (cobre todos os status)
 *
 * ⚠️ ORDEM: só cadastre DEPOIS de deployar a function `webhookSpedy`. Antes
 * disso a URL responde 404 e a Spedy registra falha de entrega.
 */

const PRODUCAO = 'https://api.spedy.com.br/v1'
const STAGE = 'https://stage-api.spedy.com.br/v1'

const URL_PADRAO =
  'https://southamerica-east1-ttrdcontabil-jpproject.cloudfunctions.net/webhookSpedy'

// invoice.status_changed cobre qualquer alteração de status — a própria doc da
// Spedy diz que é suficiente para a maioria dos casos. Um webhook, não quatro.
const EVENTO_PADRAO = 'invoice.status_changed'
const EVENTOS_VALIDOS = [
  'invoice.status_changed',
  'invoice.authorized',
  'invoice.rejected',
  'invoice.canceled',
]

const args = process.argv.slice(2)
const temFlag = (f) => args.includes(f)
const valorDe = (p) => args.find((a) => a.startsWith(`${p}=`))?.slice(p.length + 1)

const dryRun = temFlag('--dry-run')
const apenasListar = temFlag('--listar')
const base = temFlag('--stage') ? STAGE : PRODUCAO
const evento = valorDe('--evento') ?? EVENTO_PADRAO

const apiKey = process.env.SPEDY_API_KEY?.trim()
const token = process.env.SPEDY_WEBHOOK_TOKEN?.trim()

function sair(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

if (!apiKey) sair('Falta SPEDY_API_KEY no ambiente.')
if (!apenasListar && !token) {
  sair('Falta SPEDY_WEBHOOK_TOKEN — precisa ser o MESMO valor do secret SPEDY_WEBHOOK_SECRET.')
}
if (!EVENTOS_VALIDOS.includes(evento)) {
  sair(`Evento inválido: ${evento}\n  Aceitos: ${EVENTOS_VALIDOS.join(', ')}`)
}

const urlAlvo = valorDe('--url') ?? URL_PADRAO
// O token vai na query porque o cadastro de webhook da Spedy não tem campo de
// segredo. encodeURIComponent evita que um token com caractere especial quebre
// a URL — `openssl rand -hex` não gera nenhum, mas o script não depende disso.
const urlComToken = apenasListar ? urlAlvo : `${urlAlvo}?token=${encodeURIComponent(token)}`

// Nunca imprime o token inteiro: o output costuma virar print no chat.
const mascarar = (u) => u.replace(/token=[^&]+/, 'token=***')

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const texto = await resp.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    /* resposta não-JSON: `texto` preserva o cru pra mensagem de erro */
  }
  if (!resp.ok) {
    sair(`${metodo} ${caminho} → HTTP ${resp.status}\n${texto.slice(0, 800)}`)
  }
  return json
}

// A API às vezes devolve lista crua, às vezes envelopada em {data|items|results}.
function normalizarLista(r) {
  if (Array.isArray(r)) return r
  for (const chave of ['data', 'items', 'results']) {
    if (Array.isArray(r?.[chave])) return r[chave]
  }
  return []
}

console.log(`\n· Ambiente: ${base}`)
console.log(`· Evento:   ${evento}`)
if (!apenasListar) console.log(`· URL:      ${mascarar(urlComToken)}`)

const existentes = normalizarLista(await chamar('GET', '/webhooks'))

console.log(`\n· Webhooks já cadastrados: ${existentes.length}`)
for (const w of existentes) {
  const ativo = w.enabled === false ? 'DESATIVADO' : 'ativo'
  console.log(`    - [${ativo}] ${w.event}  →  ${mascarar(String(w.url ?? ''))}  (id ${w.id})`)
}

if (apenasListar) {
  console.log('')
  process.exit(0)
}

const mesmoEvento = existentes.find((w) => w.event === evento)

if (mesmoEvento && String(mesmoEvento.url) === urlComToken && mesmoEvento.enabled !== false) {
  console.log('\n✔ Já está cadastrado, com a mesma URL e ativo. Nada a fazer.\n')
  process.exit(0)
}

const acao = mesmoEvento
  ? `ATUALIZAR o webhook ${mesmoEvento.id} (evento ${evento})`
  : `CRIAR um webhook novo para ${evento}`

if (dryRun) {
  console.log(`\n· [dry-run] Faria: ${acao}`)
  console.log('· Nada foi enviado. Rode sem --dry-run para aplicar.\n')
  process.exit(0)
}

console.log(`\n· ${acao}...`)

const corpo = { event: evento, url: urlComToken }
const resultado = mesmoEvento
  ? await chamar('PUT', `/webhooks/${mesmoEvento.id}`, corpo)
  : await chamar('POST', '/webhooks', corpo)

const id = resultado?.id ?? mesmoEvento?.id
console.log(`✔ Webhook no ar (id ${id}).`)

// Um webhook criado desativado não entrega nada e não avisa — só se descobre
// quando a nota fica "processando" pra sempre. Melhor conferir agora.
if (resultado?.enabled === false) {
  console.log('· Estava desativado; ativando...')
  await chamar('PUT', `/webhooks/${id}/enable`)
  console.log('✔ Ativado.')
}

console.log('\nPróximo passo: emitir uma nota de teste e conferir a entrega em')
console.log('  firebase functions:log --only webhookSpedy\n')
