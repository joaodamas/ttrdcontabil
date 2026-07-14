/**
 * SÓ-LEITURA. Exporta o estado COMPLETO dos clientes da plataforma
 * (clientes + clientes_fiscal + clientes_servicos) já mesclado com a pesquisa de
 * CNPJ na BrasilAPI, para montar a planilha de preenchimento do contador.
 *
 * SEGURANÇA: NÃO exporta senhas/tokens/credenciais — qualquer campo com
 * senha/token/apikey/pin/login é apagado, e o sub-objeto `credenciais` do fiscal
 * é descartado inteiro. Nada sensível entra no JSON/planilha.
 * NÃO escreve nem apaga nada no Firestore (só GET/list).
 *
 * Uso:  node scripts/exportar-clientes-completo.mjs
 *       node scripts/exportar-clientes-completo.mjs --incluir-inativos
 * Saída: scripts/clientes-completo.json
 */
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const API_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const INCLUIR_INATIVOS = process.argv.includes('--incluir-inativos')
const OUT = path.join('scripts', 'clientes-completo.json')

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SENSIVEL = /senha|token|apikey|api_key|pin|^login|credenc/i

function getAccessToken() {
  try {
    const cmd = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    const t = execFileSync(cmd, ['auth', 'print-access-token', `--project=${PROJECT_ID}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (t) return t
  } catch { /* fallback */ }
  const raw = execFileSync('firebase', ['login:list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const t = JSON.parse(raw)?.result?.[0]?.tokens?.access_token
  if (!t) throw new Error('Sem access_token. Rode: gcloud auth login  (ou  firebase login)')
  return t
}

async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function listAll(collection, token) {
  const docs = []
  let pageToken = ''
  do {
    const url = `${API_BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = await apiGet(url, token)
    docs.push(...(data.documents ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

// Firestore REST -> valor JS (recursivo para map/array).
function fsValue(v) {
  if (v == null) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('nullValue' in v) return null
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fsValue(x)]))
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fsValue)
  return null
}
function docToObj(doc) {
  const o = Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, fsValue(v)]))
  o._id = doc.name.split('/').pop()
  return o
}
// Remove qualquer campo sensível (senha/token/login/...) e o objeto credenciais.
function semSegredos(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'credenciais') continue
    if (SENSIVEL.test(k)) continue
    out[k] = v
  }
  return out
}

async function fetchCnpj(cnpj, t = 0) {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${onlyDigits(cnpj)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 TTRDContabil/1.0' },
    })
    if (res.status === 429 && t < 3) { await sleep(2500 * (t + 1)); return fetchCnpj(cnpj, t + 1) }
    if (!res.ok) return { _erro: `HTTP ${res.status}` }
    return res.json()
  } catch (e) {
    if (t < 2) { await sleep(1500); return fetchCnpj(cnpj, t + 1) }
    return { _erro: e.message }
  }
}

function indexPor(docs, campo) {
  const m = new Map()
  for (const d of docs) {
    const o = docToObj(d)
    const k = o[campo]
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(o)
  }
  return m
}

async function main() {
  console.log('Lendo plataforma (só-leitura): clientes + clientes_fiscal + clientes_servicos...')
  const token = getAccessToken()
  const [clientesDocs, fiscalDocs, servicosDocs] = await Promise.all([
    listAll('clientes', token),
    listAll('clientes_fiscal', token).catch(() => []),
    listAll('clientes_servicos', token).catch(() => []),
  ])
  const fiscalPorCliente = indexPor(fiscalDocs, 'clienteId')
  const servicosPorCliente = indexPor(servicosDocs, 'clienteId')

  let clientes = clientesDocs.map(docToObj)
  const antes = clientes.length
  if (!INCLUIR_INATIVOS) {
    clientes = clientes.filter((c) => String(c.status || '').toLowerCase() !== 'inativo' && !c.deletedAt)
  }
  console.log(`Clientes: ${clientes.length}${antes !== clientes.length ? ` (de ${antes})` : ''}. Consultando CNPJ...\n`)

  const out = []
  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i]
    const id = c._id
    const ehPJ = onlyDigits(c.cpfCnpj).length === 14
    const cnpj = ehPJ ? await fetchCnpj(c.cpfCnpj) : null
    const fiscal = fiscalPorCliente.get(id)?.[0] ?? null
    const servicos = (servicosPorCliente.get(id) ?? []).map((s) => ({
      servicoNome: s.servicoNome ?? '', servicoCodigo: s.servicoCodigo ?? '', valor: s.valor ?? '',
      diaVencimento: s.diaVencimento ?? '', dataInicio: s.dataInicio ?? '', dataFim: s.dataFim ?? '',
      status: s.status ?? '', observacoes: s.observacoes ?? '',
    }))
    out.push({
      id,
      platform: semSegredos(c),
      fiscal: fiscal ? semSegredos(fiscal) : null,
      servicos,
      cnpj,
    })
    process.stdout.write(`\r${i + 1}/${clientes.length}  ${c.cpfCnpj ?? ''}`.padEnd(50))
    if (ehPJ) await sleep(500)
  }

  await writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
  console.log(`\n\nJSON gerado: ${OUT}  (${out.length} clientes, sem nenhuma senha/credencial)`)
}

main().catch((e) => { console.error('\nERRO:', e.message); process.exit(1) })
