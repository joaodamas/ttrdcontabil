/**
 * Classifica os clientes por tipo de documento fiscal (NFS-e/serviço vs NF-e/produto
 * vs CT-e/transporte) a partir do CNAE da Receita (BrasilAPI) — mesma fonte já usada
 * em exportar-clientes-cnpj.mjs.
 *
 * Por padrão roda em MODO LEITURA: consulta tudo, gera um relatório CSV
 * (scripts/clientes-classificacao-fiscal.csv) e NÃO grava nada no Firestore.
 * Só grava (`cnae`, `cnaeDescricao`, `categoriaFiscal`) nos 119 clientes quando
 * chamado com --escrever. Nenhum outro campo é tocado (sem risco pra mensalidade,
 * serviço vinculado, credenciais etc.).
 *
 * Uso:
 *   node scripts/classificar-clientes-fiscal.mjs                 (dry-run — só relatório)
 *   node scripts/classificar-clientes-fiscal.mjs --escrever      (grava de verdade)
 *
 * Precisa de autenticação (gcloud OU firebase login) — mesma exigida pelos outros
 * scripts de leitura/escrita deste diretório.
 */
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const DATABASE = '(default)'
const API_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`
const ESCREVER = process.argv.includes('--escrever')
const OUT = path.join('scripts', 'clientes-classificacao-fiscal.csv')

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Divisão (2 primeiros dígitos do CNAE) -> categoria fiscal. Segue as seções do
// IBGE CNAE 2.0: indústria/agropecuária e comércio emitem produto (NF-e/NFC-e);
// transporte emite CT-e (Spedy não cobre — autoemitem); o resto é serviço (NFS-e).
function categoriaFiscal(cnae) {
  const divisao = Number(String(cnae ?? '').slice(0, 2))
  if (!divisao) return 'indefinido'
  if (divisao >= 1 && divisao <= 3) return 'produto'   // agropecuária/pesca
  if (divisao >= 5 && divisao <= 33) return 'produto'  // indústria extrativa/transformação
  if (divisao >= 45 && divisao <= 47) return 'produto' // comércio
  if (divisao >= 49 && divisao <= 53) return 'transporte'
  return 'servico'
}

function getAccessToken() {
  try {
    const cmd = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    const token = execFileSync(cmd, ['auth', 'print-access-token', `--project=${PROJECT_ID}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
    }).trim()
    if (token) return token
  } catch { /* tenta o firebase abaixo */ }
  const firebaseCmd = process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
  const raw = execFileSync(firebaseCmd, ['login:list', '--json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
  })
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

async function apiPatch(url, token, fields, updateMaskFields) {
  const mask = updateMaskFields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
  const res = await fetch(`${url}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`PATCH ${url} -> HTTP ${res.status}: ${JSON.stringify(data)}`)
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

function f(doc, name) {
  const v = doc?.fields?.[name]
  if (!v) return ''
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return v.integerValue
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
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

function csvEscape(v) {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  console.log(ESCREVER ? 'MODO ESCRITA — vai gravar cnae/cnaeDescricao/categoriaFiscal nos clientes.' : 'MODO LEITURA (dry-run) — só gera relatório, nada é gravado.')
  const token = getAccessToken()
  const docs = (await listClientes(token)).filter((doc) => {
    const status = String(f(doc, 'status') || '').toLowerCase()
    return status !== 'inativo' && !f(doc, 'deletedAt')
  })
  console.log(`Clientes ativos: ${docs.length}\nConsultando CNAE na BrasilAPI...\n`)

  const rows = []
  const contagem = { produto: 0, servico: 0, transporte: 0, indefinido: 0, erro: 0 }
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const id = doc.name.split('/').pop()
    const razaoSocial = f(doc, 'razaoSocial') || f(doc, 'nomeFantasia')
    const cpfCnpj = f(doc, 'cpfCnpj')
    const ehPJ = onlyDigits(cpfCnpj).length === 14
    if (!ehPJ) {
      rows.push({ id, razaoSocial, cpfCnpj, cnae: '', categoria: 'indefinido (CPF)' })
      contagem.indefinido++
      continue
    }
    const d = await fetchCnpj(cpfCnpj)
    if (d?._erro) {
      rows.push({ id, razaoSocial, cpfCnpj, cnae: '', categoria: `erro (${d._erro})` })
      contagem.erro++
      process.stdout.write(`[${i + 1}/${docs.length}] ${razaoSocial}: erro (${d._erro})\n`)
      continue
    }
    const cnae = d?.cnae_fiscal ? String(d.cnae_fiscal) : ''
    const categoria = categoriaFiscal(cnae)
    contagem[categoria] = (contagem[categoria] ?? 0) + 1
    rows.push({ id, razaoSocial, cpfCnpj, cnae, cnaeDescricao: d?.cnae_fiscal_descricao ?? '', categoria })
    process.stdout.write(`[${i + 1}/${docs.length}] ${razaoSocial}: CNAE ${cnae} -> ${categoria}\n`)

    if (ESCREVER && cnae) {
      await apiPatch(`${API_BASE}/clientes/${id}`, token, {
        cnae: { stringValue: cnae },
        cnaeDescricao: { stringValue: d?.cnae_fiscal_descricao ?? '' },
        categoriaFiscal: { stringValue: categoria },
      }, ['cnae', 'cnaeDescricao', 'categoriaFiscal'])
    }
    await sleep(150) // não martelar a BrasilAPI
  }

  const head = ['id', 'razaoSocial', 'cpfCnpj', 'cnae', 'cnaeDescricao', 'categoria'].join(';')
  const body = rows.map((r) => ['id', 'razaoSocial', 'cpfCnpj', 'cnae', 'cnaeDescricao', 'categoria'].map((c) => csvEscape(r[c])).join(';')).join('\n')
  await writeFile(OUT, '﻿' + head + '\n' + body + '\n', 'utf8')

  console.log(`\nRelatório: ${OUT}`)
  console.log(`Produto: ${contagem.produto} · Serviço: ${contagem.servico} · Transporte: ${contagem.transporte} · Indefinido: ${contagem.indefinido} · Erro: ${contagem.erro}`)
  console.log(ESCREVER ? '\nGravado no Firestore (cnae, cnaeDescricao, categoriaFiscal).' : '\nNada foi gravado. Rode com --escrever pra aplicar de verdade.')
}

main().catch((e) => { console.error('Falhou:', e.message); process.exit(1) })
