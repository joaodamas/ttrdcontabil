/**
 * SÓ-LEITURA. Lista os clientes cadastrados na plataforma (Firestore `clientes`),
 * consulta cada CNPJ na BrasilAPI (dado público da Receita) e gera uma planilha
 * CSV preenchida (de-para: o que está na plataforma vs. o que a Receita retorna).
 *
 * NÃO escreve nem apaga NADA — nenhuma chamada PATCH/DELETE. É seguro rodar.
 * Precisa de autenticação (gcloud OU firebase login) só para LER o Firestore.
 *
 * Uso:
 *   node scripts/exportar-clientes-cnpj.mjs
 *   node scripts/exportar-clientes-cnpj.mjs --incluir-inativos   (inclui status inativo/baixado)
 *
 * Saída: scripts/clientes-119-preenchido.csv
 */
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const DATABASE = '(default)'
const API_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`
const INCLUIR_INATIVOS = process.argv.includes('--incluir-inativos')
const OUT = path.join('scripts', 'clientes-119-preenchido.csv')

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '')
const formatCnpj = (v) => onlyDigits(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SITUACAO = { 1: 'NULA', 2: 'ATIVA', 3: 'SUSPENSA', 4: 'INAPTA', 8: 'BAIXADA' }

function regime(d) {
  if (d?.opcao_pelo_mei) return 'MEI'
  if (d?.opcao_pelo_simples) return 'Simples Nacional'
  return 'Normal (Presumido/Real)'
}

// ── Auth (igual ao reset-clientes-lista-cnpj.mjs): gcloud, com fallback p/ firebase ──
function getAccessToken() {
  try {
    const cmd = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    const token = execFileSync(cmd, ['auth', 'print-access-token', `--project=${PROJECT_ID}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (token) return token
  } catch { /* tenta o firebase abaixo */ }
  const raw = execFileSync('firebase', ['login:list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const token = JSON.parse(raw)?.result?.[0]?.tokens?.access_token
  if (!token) throw new Error('Sem access_token. Rode: gcloud auth login   (ou  firebase login)')
  return token
}

async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function listClientes(token) {
  const docs = []
  let pageToken = ''
  do {
    const url = `${API_BASE}/clientes?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = await apiGet(url, token)
    docs.push(...(data.documents ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

// Lê um campo do doc Firestore REST, seja qual for o tipo escalar.
function f(doc, name) {
  const v = doc?.fields?.[name]
  if (!v) return ''
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return v.integerValue
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('nullValue' in v) return ''
  return ''
}

async function fetchCnpj(cnpj, tentativa = 0) {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${onlyDigits(cnpj)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 TTRDContabil/1.0' },
    })
    if (res.status === 429 && tentativa < 3) { await sleep(2500 * (tentativa + 1)); return fetchCnpj(cnpj, tentativa + 1) }
    if (!res.ok) return { _erro: `HTTP ${res.status}` }
    return res.json()
  } catch (e) {
    if (tentativa < 2) { await sleep(1500); return fetchCnpj(cnpj, tentativa + 1) }
    return { _erro: e.message }
  }
}

const COLS = [
  'id', 'codigo', 'razao_social_plataforma', 'cpf_cnpj', 'tipo', 'status_plataforma',
  'razao_social_receita', 'nome_fantasia', 'situacao_receita', 'regime',
  'porte', 'natureza_juridica', 'cnae', 'cnae_descricao', 'cep', 'logradouro', 'numero',
  'complemento', 'bairro', 'municipio', 'uf', 'municipio_ibge', 'socio_principal',
  'telefone', 'email', 'capital_social', 'inicio_atividade', 'consulta',
]

function linha(doc, d) {
  const id = doc.name.split('/').pop()
  const cpfCnpj = f(doc, 'cpfCnpj')
  const digits = onlyDigits(cpfCnpj)
  const ehPJ = digits.length === 14
  const erro = d?._erro
  return {
    id,
    codigo: f(doc, 'codigo'),
    razao_social_plataforma: f(doc, 'razaoSocial') || f(doc, 'nomeFantasia'),
    cpf_cnpj: cpfCnpj || '',
    tipo: ehPJ ? 'PJ' : (digits.length === 11 ? 'PF' : '?'),
    status_plataforma: f(doc, 'status'),
    razao_social_receita: d?.razao_social || '',
    nome_fantasia: d?.nome_fantasia || '',
    situacao_receita: d?.descricao_situacao_cadastral || SITUACAO[d?.situacao_cadastral] || '',
    regime: d && !erro ? regime(d) : '',
    porte: d?.porte || '',
    natureza_juridica: d?.natureza_juridica || '',
    cnae: d?.cnae_fiscal || '',
    cnae_descricao: d?.cnae_fiscal_descricao || '',
    cep: d?.cep || '',
    logradouro: [d?.descricao_tipo_de_logradouro, d?.logradouro].filter(Boolean).join(' '),
    numero: d?.numero || '',
    complemento: d?.complemento || '',
    bairro: d?.bairro || '',
    municipio: d?.municipio || '',
    uf: d?.uf || '',
    municipio_ibge: d?.codigo_municipio_ibge || '',
    socio_principal: d?.qsa?.[0]?.nome_socio || '',
    telefone: d?.ddd_telefone_1 || '',
    email: d?.email || '',
    capital_social: d?.capital_social ?? '',
    inicio_atividade: d?.data_inicio_atividade || '',
    consulta: !ehPJ ? 'CPF/sem CNPJ' : (erro ? `sem retorno (${erro})` : 'ok'),
  }
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(rows) {
  const head = COLS.join(';')
  const body = rows.map((r) => COLS.map((c) => csvEscape(r[c])).join(';')).join('\n')
  return '﻿' + head + '\n' + body + '\n'
}

async function main() {
  console.log('Lendo clientes da plataforma (só-leitura)...')
  const token = getAccessToken()
  let docs = await listClientes(token)
  const antes = docs.length
  if (!INCLUIR_INATIVOS) {
    docs = docs.filter((doc) => {
      const status = String(f(doc, 'status') || '').toLowerCase()
      const deletado = f(doc, 'deletedAt')
      return status !== 'inativo' && !deletado
    })
  }
  console.log(`Clientes: ${docs.length}${antes !== docs.length ? ` (de ${antes}; ${antes - docs.length} inativos/deletados ocultos — use --incluir-inativos p/ trazer todos)` : ''}`)
  console.log('Consultando CNPJ por CNPJ na BrasilAPI...\n')

  const rows = []
  let ok = 0, falha = 0, pf = 0
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const cpfCnpj = f(doc, 'cpfCnpj')
    const ehPJ = onlyDigits(cpfCnpj).length === 14
    const d = ehPJ ? await fetchCnpj(cpfCnpj) : null
    const row = linha(doc, d)
    rows.push(row)
    if (row.consulta === 'ok') ok++
    else if (row.consulta.startsWith('CPF')) pf++
    else falha++
    console.log(`${String(i + 1).padStart(3)}/${docs.length}  ${(row.cpf_cnpj || '—').padEnd(18)}  ${(row.razao_social_receita || row.razao_social_plataforma || '').slice(0, 40).padEnd(40)}  ${(row.regime || row.consulta)}`)
    if (ehPJ) await sleep(500)
  }

  await writeFile(OUT, toCsv(rows), 'utf8')
  console.log(`\nOK: ${ok}  |  PF (sem CNPJ): ${pf}  |  sem retorno: ${falha}`)
  console.log(`Planilha gerada: ${OUT}`)
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
