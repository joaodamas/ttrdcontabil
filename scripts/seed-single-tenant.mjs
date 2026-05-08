import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const TENANT_ID = process.env.TENANT_ID ?? process.env.NEXT_PUBLIC_APP_TENANT_ID ?? 'ttrd'
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'TTRD Contábil'
const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? 'TTRD'
const APP_TAGLINE = process.env.NEXT_PUBLIC_APP_TAGLINE ?? 'Gestão Contábil Integrada'
const ALERT_EMAIL = process.env.ALERT_EMAIL ?? process.env.EMAIL_TO ?? ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Administrador'

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!rawKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não configurada.')
  }
  initializeApp({ credential: cert(JSON.parse(rawKey)) })
}

initAdmin()

const db = getFirestore()
const auth = getAuth()

const SERVICOS_BASE = [
  { id: 'contabilidade-mensal', nome: 'Contabilidade Mensal', frequencia: 'mensal', ativo: true },
  { id: 'simples-nacional', nome: 'Apuração Simples Nacional', frequencia: 'mensal', ativo: true },
  { id: 'lucro-presumido', nome: 'Apuração Lucro Presumido', frequencia: 'mensal', ativo: true },
  { id: 'folha-pagamento', nome: 'Folha de Pagamento', frequencia: 'mensal', ativo: true },
  { id: 'esocial', nome: 'eSocial', frequencia: 'mensal', ativo: true },
  { id: 'reinf', nome: 'EFD-REINF', frequencia: 'mensal', ativo: true },
  { id: 'fgts-digital', nome: 'FGTS Digital', frequencia: 'mensal', ativo: true },
  { id: 'irpf', nome: 'Declaração IRPF', frequencia: 'anual', ativo: true },
]

const CONECTORES_BASE = [
  ['jundiai-sp', 'Jundiaí', '3525904', 'abrasf_a1', true],
  ['campinas-sp', 'Campinas', '3509502', 'abrasf_a1', true],
  ['cajamar-sp', 'Cajamar', '3508900', 'abrasf_a1', true],
  ['sao-paulo-sp', 'São Paulo', '3550308', 'proprietario_a1', true],
  ['barueri-sp', 'Barueri', '3505708', 'proprietario_a1', true],
  ['santana-parnaiba-sp', 'Santana de Parnaíba', '3547304', 'simpliss_token', false],
  ['taboao-serra-sp', 'Taboão da Serra', '3552502', 'portal_token', false],
  ['cotia-sp', 'Cotia', '3513009', 'portal_credencial', false],
]

async function setDoc(collection, id, data) {
  await db.collection(collection).doc(id).set({
    tenantId: TENANT_ID,
    ...data,
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log(`upsert ${collection}/${id}`)
}

async function seedAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('skip admin: ADMIN_EMAIL e ADMIN_PASSWORD não configurados')
    return
  }

  let user
  try {
    user = await auth.getUserByEmail(ADMIN_EMAIL)
  } catch {
    user = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
    })
  }

  await setDoc('usuarios', user.uid, {
    nome: ADMIN_NAME,
    email: ADMIN_EMAIL,
    perfil: 'admin',
    ativo: true,
    telas: ['hoje', 'clientes', 'tarefas', 'competencias', 'fechamento', 'financeiro', 'fiscal', 'ir', 'admin', 'servicos', 'dashboard'],
  })
}

async function main() {
  console.log(`Seed single-tenant iniciado para tenant "${TENANT_ID}"`)

  await setDoc('configuracoes', 'escritorio', {
    appName: APP_NAME,
    appShortName: APP_SHORT_NAME,
    appTagline: APP_TAGLINE,
    emailAlertas: ALERT_EMAIL,
    ambienteFiscalPadrao: 'homologacao',
    whitelabel: true,
  })

  for (const servico of SERVICOS_BASE) {
    const { id, ...data } = servico
    await setDoc('servicos', id, data)
  }

  for (const [id, municipio, municipioIbge, tipoIntegracao, exigeCertificadoA1] of CONECTORES_BASE) {
    await setDoc('fiscal_conectores', id, {
      nome: `Prefeitura de ${municipio}`,
      municipio,
      uf: 'SP',
      municipioIbge,
      tipoIntegracao,
      exigeCertificadoA1,
      ativo: true,
      homologado: false,
      producaoLiberada: false,
      emissao: true,
      consulta: false,
      cancelamento: false,
    })
  }

  await seedAdmin()

  console.log('Seed single-tenant concluído.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
