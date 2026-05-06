import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const DATABASE = '(default)'
const TENANT_ID = process.env.TENANT_ID ?? 'ttrd'
const WRITE = process.argv.includes('--write')
const SKIP_CNPJ = process.argv.includes('--skip-cnpj')
const API_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`

const CLIENTES = [
  ['LA VERGANI SERVICOS ADMINISTRATIVOS LTDA', '46.855.569/0001-30'],
  ['RGS SUPORTE E ACESSORIA EM TECNOLOGIA DA INFORMACAO LTDA', '55.192.190/0001-88'],
  ['DISTRIBUIDORA DE AGUA RUSSO LTDA', '43.088.085/0001-14'],
  ['RENATO PIZZA BUFFET & EVENTOS LTDA', '46.806.770/0001-27'],
  ['IT SOLUTIONS FC - SERVICOS EM TI LTDA', '40.702.120/0001-67'],
  ['HELITE 22 LTDA', '44.077.697/0001-74'],
  ['CAPI MEDICAL LTDA', '48.547.992/0001-06'],
  ['DAVI ANDRE TENORIO 11387595466', '46.822.327/0001-40'],
  ['J CAR CONSULTORIA E INTERMEDIACAO LTDA', '55.435.062/0001-18'],
  ['MARQUES MARCENARIA LTDA', '45.859.047/0001-43'],
  ['AUTO VIDROS COLINAS LTDA', '43.885.283/0001-09'],
  ['MARCELLA B. ARAUJO ATELIE DE FESTA', '17.454.276/0001-42'],
  ['FPL A SERVICOS ADMINISTRATIVOS LTDA', '50.004.056/0001-92'],
  ['BERNARDES RAMOS MIDIAS LTDA', '47.981.937/0001-59'],
  ['ARTE & PRIME PLANEJADOS LTDA', '33.854.681/0001-04'],
  ['BAR E LANCHONETE VITORIA PORTAL LTDA', '28.600.123/0001-82'],
  ['CANTINHO DAS CAIPIRINHAS LTDA', '51.283.322/0001-26'],
  ['ACAI DO PARAIBA FAZEDINHA LTDA', '47.413.029/0001-69'],
  ['CA ALMEIDA PRESTACAO DE SERVICOS LTDA', '51.551.416/0001-39'],
  ['MVM SOLUCOES LTDA', '52.227.643/0001-76'],
  ['DAYHEL LTDA', '41.799.618/0001-40'],
  ['MARIAS CONFEITARIA GOURMET LTDA', '29.054.602/0001-03'],
  ['HELITE 22 DISTRIBUIDORA DE PRODUTOS AUTOMOTIVOS LTDA', '53.325.465/0001-89'],
  ['CRMULT ENGENHARIA ENERGY SOLAR LTDA', '44.737.855/0001-75'],
  ['BRINQUEDOTECA MUNDO MAGICO LTDA', '44.030.889/0001-25'],
  ['GREENLINE MANUTENCAO DE MAQUINAS', '46.838.030/0001-72'],
  ['ESPETOS ARTE BAR E ESPETARIA LTDA.', '36.740.273/0001-10'],
  ['CLICKON UTILIDADES LTDA', '51.479.243/0001-95'],
  ['MINEIRO CONSTRUCOES E REFORMAS LTDA', '43.300.602/0001-77'],
  ['WKS CONSTRUCOES & REFORMAS LTDA', '35.671.897/0001-60'],
  ['JGKB CANTINHO LTDA', '46.869.779/0001-87'],
  ['JOSE ROBERTO CAETANO DA SILVA 90184386420', '42.959.823/0001-99'],
  ['J-CAR MOTORS COMERCIO DE VEICULOS LTDA', '28.409.104/0001-73'],
  ['DOUGLAS RICARDO DE ALMEIDA GONCALVES 22256013804', '12.249.083/0001-36'],
  ['CAMARA DE CONCILIACAO, MEDIACAO E ARBITRAGEM CMS LTDA', '51.912.995/0001-06'],
  ['MISTER THUNDER DISTRIBUIDORA LTDA', '52.019.102/0001-52'],
  ['DRS CURSOS E MANUTENCAO LTDA', '51.407.457/0001-56'],
  ['GOMES CONSULTORIA ASSESSORIA E SERVICOS', '28.217.934/0001-07'],
  ['ASSOCIACAO PAULISTANOS DE HABITACAO E ASSOCIADOS', '36.424.235/0001-58'],
  ['ASSOCIACAO DO RESIDENCIAL RECANTO DA SERRA', '74.634.783/0001-00'],
  ['CAMARA DE CONCILIACAO, MEDIACAO E ARBITRAGEM VALENTINA KALIL LTDA', '54.026.236/0001-26'],
  ['MIX MULTIMARCAS VEICULOS E MOTOS LTDA', '35.726.947/0001-69'],
  ['MANIA SALGADOS & CIA LTDA', '57.751.724/0001-94'],
  ['MARCENARIA OSMAR MOVEIS PLANEJADOS LTDA', '28.655.495/0001-06'],
  ['ENGRAMA TERAPIAS LTDA', '53.925.982/0001-99'],
  ['PETALAS DE ROSAS COMERCIO DE PRODUTOS DE LIMPEZA LTDA', '37.099.941/0001-34'],
]

const DEPENDENT_COLLECTIONS = [
  'clientes_servicos',
  'competencias',
  'tarefas',
  'tarefas_comentarios',
  'lancamentos',
  'cobrancas',
  'fechamentos',
  'clientes_fiscal',
  'clientes_fiscal_integracao',
  'nfse_rascunhos',
  'nfse_emitidas',
  'nfse_eventos',
  'nfse_erros',
  'nfse_fila_processamento',
  'ir_declaracoes',
  'ir_checklist',
  'documentos',
  'events',
]

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function formatCnpj(value) {
  const d = onlyDigits(value)
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function stringValue(value) {
  return value == null ? { nullValue: null } : { stringValue: String(value) }
}

function intValue(value) {
  return Number.isFinite(Number(value)) ? { integerValue: String(Number(value)) } : { nullValue: null }
}

function timestampValue(date = new Date()) {
  return { timestampValue: date.toISOString() }
}

function toFirestoreDoc(fields) {
  return { fields }
}

function getAccessToken() {
  try {
    const gcloudCommand = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    const token = execFileSync(
      gcloudCommand,
      ['auth', 'print-access-token', `--project=${PROJECT_ID}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim()
    if (token) return token
  } catch {
    // Fallback para ambientes sem gcloud autenticado.
  }

  const command = process.platform === 'win32' ? 'cmd.exe' : 'firebase'
  const args = process.platform === 'win32'
    ? ['/c', 'firebase', 'login:list', '--json']
    : ['login:list', '--json']
  const raw = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const parsed = JSON.parse(raw)
  const token = parsed?.result?.[0]?.tokens?.access_token
  if (!token) throw new Error('Não foi possível obter access_token do Firebase CLI.')
  return token
}

async function api(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function listCollection(collectionName, token) {
  const docs = []
  let pageToken = ''
  do {
    const url = `${API_BASE}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = await api('GET', url, token)
    docs.push(...(data.documents ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

async function runQuery(collectionName, field, value, token) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: collectionName }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: { stringValue: value },
        },
      },
    },
  }
  const data = await api('POST', `${API_BASE}:runQuery`, token, body)
  return data.map((row) => row.document).filter(Boolean)
}

async function deleteDocByName(name, token) {
  await api('DELETE', `https://firestore.googleapis.com/v1/${name}`, token)
}

async function fetchCnpj(cnpj) {
  const digits = onlyDigits(cnpj)
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 TTRDContabil/1.0',
    },
  })
  if (!res.ok) return null
  return res.json()
}

function inferRegime(cnpjData) {
  if (cnpjData?.opcao_pelo_mei) return 'mei'
  if (cnpjData?.opcao_pelo_simples) return 'simples_nacional'
  return null
}

function buildClienteDoc(row, index, cnpjData) {
  const [nomePlanilha, cnpj] = row
  const razaoSocial = cnpjData?.razao_social || nomePlanilha
  return toFirestoreDoc({
    tenantId: stringValue(TENANT_ID),
    codigo: intValue(index + 1),
    tipoPessoa: stringValue('pj'),
    razaoSocial: stringValue(razaoSocial),
    nomeFantasia: stringValue(cnpjData?.nome_fantasia || ''),
    cpfCnpj: stringValue(formatCnpj(cnpj)),
    email: stringValue(cnpjData?.email || ''),
    telefone: stringValue(cnpjData?.ddd_telefone_1 || ''),
    celular: stringValue(''),
    cep: stringValue(cnpjData?.cep || ''),
    logradouro: stringValue([cnpjData?.descricao_tipo_de_logradouro, cnpjData?.logradouro].filter(Boolean).join(' ')),
    numero: stringValue(cnpjData?.numero || ''),
    complemento: stringValue(cnpjData?.complemento || ''),
    bairro: stringValue(cnpjData?.bairro || ''),
    cidade: stringValue(cnpjData?.municipio || ''),
    uf: stringValue(cnpjData?.uf || ''),
    regimeTributario: stringValue(inferRegime(cnpjData)),
    responsavelNome: stringValue(cnpjData?.qsa?.[0]?.nome_socio || ''),
    responsavelEmail: stringValue(cnpjData?.email || ''),
    responsavelTelefone: stringValue(cnpjData?.ddd_telefone_1 || ''),
    observacoes: stringValue([
      `Importado em ${new Date().toLocaleString('pt-BR')}.`,
      `Nome na lista: ${nomePlanilha}.`,
      cnpjData?.cnae_fiscal_descricao ? `CNAE: ${cnpjData.cnae_fiscal} - ${cnpjData.cnae_fiscal_descricao}.` : '',
      cnpjData?.descricao_situacao_cadastral ? `Situação cadastral: ${cnpjData.descricao_situacao_cadastral}.` : '',
      cnpjData?.porte ? `Porte: ${cnpjData.porte}.` : '',
      cnpjData?.natureza_juridica ? `Natureza jurídica: ${cnpjData.natureza_juridica}.` : '',
    ].filter(Boolean).join('\n')),
    status: stringValue(cnpjData?.situacao_cadastral === 2 || cnpjData?.descricao_situacao_cadastral === 'ATIVA' ? 'ativo' : 'suspenso'),
    diaEmissaoNFSe: { nullValue: null },
    cnpjConsultaFonte: stringValue('BrasilAPI CNPJ'),
    cnpjConsultaEm: timestampValue(),
    municipioIbge: stringValue(cnpjData?.codigo_municipio_ibge || ''),
    cnaeFiscal: intValue(cnpjData?.cnae_fiscal),
    criadoEm: timestampValue(),
    atualizadoEm: timestampValue(),
  })
}

async function backupCollections(token) {
  const backup = {}
  for (const collectionName of ['clientes', ...DEPENDENT_COLLECTIONS]) {
    backup[collectionName] = await listCollection(collectionName, token).catch((err) => {
      console.warn(`backup ${collectionName}: ${err.message}`)
      return []
    })
  }
  const dir = path.join('backups', 'clientes-reset')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await writeFile(file, JSON.stringify(backup, null, 2), 'utf8')
  return file
}

async function main() {
  const duplicates = CLIENTES.map(([, cnpj]) => onlyDigits(cnpj)).filter((cnpj, idx, arr) => arr.indexOf(cnpj) !== idx)
  if (duplicates.length > 0) throw new Error(`CNPJs duplicados na lista: ${duplicates.join(', ')}`)

  console.log(`Clientes na lista: ${CLIENTES.length}`)
  console.log(WRITE ? 'Modo escrita: SIM' : 'Modo dry-run: nenhuma alteração será gravada')

  const enriched = []
  for (const [nome, cnpj] of CLIENTES) {
    const data = SKIP_CNPJ ? null : await fetchCnpj(cnpj).catch(() => null)
    enriched.push({ nome, cnpj, razaoSocial: data?.razao_social ?? null, status: data?.descricao_situacao_cadastral ?? null })
    console.log(`${formatCnpj(cnpj)} | ${data?.razao_social ?? nome} | ${data?.descricao_situacao_cadastral ?? 'sem retorno'}`)
  }

  if (!WRITE) {
    await mkdir(path.join('backups', 'clientes-reset'), { recursive: true })
    await writeFile(
      path.join('backups', 'clientes-reset', 'dry-run-clientes.json'),
      JSON.stringify(enriched, null, 2),
      'utf8'
    )
    return
  }

  const token = getAccessToken()
  const backupFile = await backupCollections(token)
  console.log(`Backup salvo em ${backupFile}`)

  const clientesExistentes = await listCollection('clientes', token)
  const clienteIds = clientesExistentes.map((doc) => doc.name.split('/').pop()).filter(Boolean)
  console.log(`Clientes existentes a remover: ${clienteIds.length}`)

  for (const collectionName of DEPENDENT_COLLECTIONS) {
    const docsToDelete = new Map()
    for (const clienteId of clienteIds) {
      for (const field of ['clienteId', 'origemId']) {
        const docs = await runQuery(collectionName, field, clienteId, token).catch(() => [])
        for (const doc of docs) docsToDelete.set(doc.name, doc)
      }
    }
    console.log(`${collectionName}: removendo ${docsToDelete.size}`)
    for (const name of docsToDelete.keys()) await deleteDocByName(name, token)
  }

  for (const doc of clientesExistentes) await deleteDocByName(doc.name, token)

  for (let i = 0; i < CLIENTES.length; i++) {
    const [, cnpj] = CLIENTES[i]
    const cnpjData = SKIP_CNPJ ? null : await fetchCnpj(cnpj).catch(() => null)
    const id = onlyDigits(cnpj)
    await api('PATCH', `${API_BASE}/clientes/${id}`, token, buildClienteDoc(CLIENTES[i], i, cnpjData))
    console.log(`importado clientes/${id}`)
  }

  console.log(`Importação concluída: ${CLIENTES.length} cliente(s).`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
