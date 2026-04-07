/**
 * Seed script — populates initial Firestore data for TTRD Contábil.
 *
 * Usage:
 *   npx tsx src/scripts/seed.ts
 *
 * Requires the environment variable FIREBASE_SERVICE_ACCOUNT_KEY to be set
 * (same as the application). Copy .env.local values or export them before running.
 */

import 'dotenv/config'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// ── Init ─────────────────────────────────────────────────────────────────────

function initAdmin() {
  if (getApps().length > 0) return getApps()[0]
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set')
  return initializeApp({ credential: cert(JSON.parse(key)) })
}

initAdmin()
const db = getFirestore()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsert(collection: string, id: string, data: Record<string, unknown>) {
  const ref = db.collection(collection).doc(id)
  const snap = await ref.get()
  if (snap.exists) {
    console.log(`  skip  ${collection}/${id} (already exists)`)
  } else {
    await ref.set({ ...data, criadoEm: Timestamp.now(), atualizadoEm: Timestamp.now() })
    console.log(`  added ${collection}/${id}`)
  }
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const FISCAL_CONECTORES = [
  {
    id: 'prefeitura-sp',
    nome: 'Prefeitura de São Paulo',
    municipio: 'São Paulo',
    uf: 'SP',
    sistemaEmissao: 'NF-e Paulistana',
    urlPortal: 'https://nfe.prefeitura.sp.gov.br',
    tipoIntegracao: 'api_rest',
    ativo: true,
  },
  {
    id: 'prefeitura-rj',
    nome: 'Prefeitura do Rio de Janeiro',
    municipio: 'Rio de Janeiro',
    uf: 'RJ',
    sistemaEmissao: 'Nota Carioca',
    urlPortal: 'https://notacarioca.rio.gov.br',
    tipoIntegracao: 'api_rest',
    ativo: true,
  },
  {
    id: 'prefeitura-bh',
    nome: 'Prefeitura de Belo Horizonte',
    municipio: 'Belo Horizonte',
    uf: 'MG',
    sistemaEmissao: 'BH-ISS',
    urlPortal: 'https://bhiss.pbh.gov.br',
    tipoIntegracao: 'webservice',
    ativo: true,
  },
  {
    id: 'prefeitura-cwb',
    nome: 'Prefeitura de Curitiba',
    municipio: 'Curitiba',
    uf: 'PR',
    sistemaEmissao: 'ISS Digital',
    urlPortal: 'https://issonline.curitiba.pr.gov.br',
    tipoIntegracao: 'webservice',
    ativo: true,
  },
  {
    id: 'prefeitura-poa',
    nome: 'Prefeitura de Porto Alegre',
    municipio: 'Porto Alegre',
    uf: 'RS',
    sistemaEmissao: 'NFS-e POA',
    urlPortal: 'https://www2.portoalegre.rs.gov.br/nfse',
    tipoIntegracao: 'webservice',
    ativo: true,
  },
  {
    id: 'prefeitura-fortaleza',
    nome: 'Prefeitura de Fortaleza',
    municipio: 'Fortaleza',
    uf: 'CE',
    sistemaEmissao: 'NFS-e Fortaleza',
    urlPortal: 'https://nfs-e.fortaleza.ce.gov.br',
    tipoIntegracao: 'api_rest',
    ativo: true,
  },
  {
    id: 'prefeitura-manaus',
    nome: 'Prefeitura de Manaus',
    municipio: 'Manaus',
    uf: 'AM',
    sistemaEmissao: 'NFS-e Manaus',
    urlPortal: 'https://nfse.manaus.am.gov.br',
    tipoIntegracao: 'webservice',
    ativo: true,
  },
  {
    id: 'manual-assistido',
    nome: 'Emissão Manual Assistida',
    municipio: null,
    uf: null,
    sistemaEmissao: 'Manual',
    urlPortal: null,
    tipoIntegracao: 'manual_assistido',
    descricao: 'Para municípios sem integração direta. O sistema guia o preenchimento e você emite manualmente no portal.',
    ativo: true,
  },
]

const SERVICOS_PADRAO = [
  {
    id: 'contabilidade-mensal',
    nome: 'Contabilidade Mensal',
    descricao: 'Escrituração contábil mensal, balancetes e demonstrações financeiras.',
    frequencia: 'mensal',
    valorPadrao: null,
    ativo: true,
  },
  {
    id: 'folha-pagamento',
    nome: 'Folha de Pagamento',
    descricao: 'Processamento de folha, FGTS, INSS e obrigações trabalhistas.',
    frequencia: 'mensal',
    valorPadrao: null,
    ativo: true,
  },
  {
    id: 'abertura-empresa',
    nome: 'Abertura de Empresa',
    descricao: 'Registro e constituição de pessoa jurídica junto aos órgãos competentes.',
    frequencia: 'avulso',
    valorPadrao: null,
    ativo: true,
  },
  {
    id: 'irpf',
    nome: 'Declaração IRPF',
    descricao: 'Elaboração e entrega da declaração anual do Imposto de Renda Pessoa Física.',
    frequencia: 'anual',
    valorPadrao: null,
    ativo: true,
  },
  {
    id: 'irpj',
    nome: 'Declaração IRPJ / CSLL',
    descricao: 'Apuração e declaração anual do Imposto de Renda Pessoa Jurídica.',
    frequencia: 'anual',
    valorPadrao: null,
    ativo: true,
  },
  {
    id: 'simples-nacional',
    nome: 'Apuração Simples Nacional',
    descricao: 'Cálculo e geração do DAS mensal para empresas optantes pelo Simples Nacional.',
    frequencia: 'mensal',
    valorPadrao: null,
    ativo: true,
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TTRD Contábil — Seed ===\n')

  console.log('fiscal_conectores:')
  for (const c of FISCAL_CONECTORES) {
    const { id, ...data } = c
    await upsert('fiscal_conectores', id, data as Record<string, unknown>)
  }

  console.log('\nservicos:')
  for (const s of SERVICOS_PADRAO) {
    const { id, ...data } = s
    await upsert('servicos', id, data as Record<string, unknown>)
  }

  console.log('\nDone.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
