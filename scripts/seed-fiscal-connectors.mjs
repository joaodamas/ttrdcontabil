import { execFileSync } from 'node:child_process'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const TENANT_ID = process.env.TENANT_ID ?? 'ttrd'
const DATABASE = '(default)'
const API_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`

const CONNECTORS = [
  {
    id: 'jundiai-sp',
    nome: 'Prefeitura de Jundiai',
    municipio: 'Jundiai',
    uf: 'SP',
    municipioIbge: '3525904',
    tipoIntegracao: 'abrasf_a1',
    urlPortal: 'https://jundiai.ginfes.com.br/',
    emissao: true,
    consulta: true,
    cancelamento: true,
    exigeCertificadoA1: true,
  },
  {
    id: 'campinas-sp',
    nome: 'Prefeitura de Campinas',
    municipio: 'Campinas',
    uf: 'SP',
    municipioIbge: '3509502',
    tipoIntegracao: 'abrasf_a1',
    urlPortal: 'https://novanfse.campinas.sp.gov.br/notafiscal/paginas/portal/index.html#/',
    emissao: true,
    consulta: true,
    cancelamento: true,
    exigeCertificadoA1: true,
  },
  {
    id: 'cajamar-sp',
    nome: 'Prefeitura de Cajamar',
    municipio: 'Cajamar',
    uf: 'SP',
    municipioIbge: '3508900',
    tipoIntegracao: 'abrasf_a1',
    urlPortal: 'https://geisweb.com.br/cajamar/index.php',
    emissao: true,
    consulta: true,
    cancelamento: true,
    exigeCertificadoA1: true,
  },
  {
    id: 'sao-paulo-sp',
    nome: 'Nota do Milhao - Sao Paulo',
    municipio: 'Sao Paulo',
    uf: 'SP',
    municipioIbge: '3550308',
    tipoIntegracao: 'proprietario_a1',
    urlPortal: 'https://notadomilhao.prefeitura.sp.gov.br/',
    emissao: true,
    consulta: false,
    cancelamento: false,
    exigeCertificadoA1: true,
  },
  {
    id: 'barueri-sp',
    nome: 'Prefeitura de Barueri',
    municipio: 'Barueri',
    uf: 'SP',
    municipioIbge: '3505708',
    tipoIntegracao: 'proprietario_a1',
    urlPortal: 'https://www.barueri.sp.gov.br/nfe/wfPrincipalNF.aspx',
    emissao: true,
    consulta: false,
    cancelamento: false,
    exigeCertificadoA1: true,
  },
  {
    id: 'santana-parnaiba-sp',
    nome: 'Prefeitura de Santana de Parnaiba',
    municipio: 'Santana de Parnaiba',
    uf: 'SP',
    municipioIbge: '3547304',
    tipoIntegracao: 'simpliss_token',
    urlPortal: 'https://homologacaoabrasf.simplissweb.com.br/api',
    emissao: true,
    consulta: false,
    cancelamento: false,
    exigeCertificadoA1: false,
  },
  {
    id: 'taboao-serra-sp',
    nome: 'Prefeitura de Taboao da Serra',
    municipio: 'Taboao da Serra',
    uf: 'SP',
    municipioIbge: '3552502',
    tipoIntegracao: 'portal_token',
    urlPortal: 'https://nfe.etransparencia.com.br/sp.taboaodaserra/nfe/principal.aspx',
    emissao: true,
    consulta: false,
    cancelamento: false,
    exigeCertificadoA1: false,
  },
  {
    id: 'cotia-sp',
    nome: 'Prefeitura de Cotia',
    municipio: 'Cotia',
    uf: 'SP',
    municipioIbge: '3513009',
    tipoIntegracao: 'portal_credencial',
    urlPortal: null,
    emissao: true,
    consulta: false,
    cancelamento: false,
    exigeCertificadoA1: false,
  },
  {
    id: 'manual-assistido',
    nome: 'Emissao Manual Assistida',
    municipio: null,
    uf: null,
    municipioIbge: null,
    tipoIntegracao: 'manual_assistido',
    urlPortal: null,
    emissao: false,
    consulta: false,
    cancelamento: false,
    exigeCertificadoA1: false,
  },
]

function token() {
  if (process.platform === 'win32') {
    return execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8' }).trim()
  }
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
}

function field(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return { integerValue: String(value) }
  return { stringValue: String(value) }
}

function docBody(data) {
  return {
    fields: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, field(value)])
    ),
  }
}

async function patchDocument(id, data, accessToken) {
  const url = `${API_BASE}/fiscal_conectores/${encodeURIComponent(id)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(docBody(data)),
  })

  if (!res.ok) {
    throw new Error(`${id}: ${res.status} ${await res.text()}`)
  }
}

async function main() {
  const accessToken = token()
  const now = new Date().toISOString()

  for (const connector of CONNECTORS) {
    const { id, ...data } = connector
    await patchDocument(id, {
      ...data,
      tenantId: TENANT_ID,
      ativo: true,
      homologado: false,
      producaoLiberada: false,
      atualizadoEmIso: now,
    }, accessToken)
    console.log(`upsert fiscal_conectores/${id}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
