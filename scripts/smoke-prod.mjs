import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getCountFromServer, getDoc, getFirestore, limit, query } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8',
  authDomain: 'ttrdcontabil-jpproject.firebaseapp.com',
  projectId: 'ttrdcontabil-jpproject',
  storageBucket: 'ttrdcontabil-jpproject.firebasestorage.app',
  messagingSenderId: '1077611965156',
  appId: '1:1077611965156:web:adf49df9b1e34982df1af1',
}

const EMAIL = process.env.ADMIN_EMAIL ?? 'joaodamasit@gmail.com'
const PASSWORD = process.env.ADMIN_PASSWORD

const CHECK_COLLECTIONS = [
  'usuarios',
  'clientes',
  'servicos',
  'clientes_servicos',
  'competencias',
  'tarefas',
  'lancamentos',
  'fechamentos',
  'clientes_fiscal',
  'nfse_rascunhos',
  'nfse_emitidas',
  'dashboard_kpis',
  'events',
  'logs_auditoria',
]

async function main() {
  if (!PASSWORD) throw new Error('Defina ADMIN_PASSWORD no ambiente.')

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const functions = getFunctions(app, 'southamerica-east1')

  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  const userDoc = await getDoc(doc(db, 'usuarios', cred.user.uid))
  if (!userDoc.exists()) throw new Error(`Documento usuarios/${cred.user.uid} não encontrado.`)
  console.log(`auth: ok (${EMAIL})`)
  console.log(`perfil: ${userDoc.data().perfil ?? '-'} | tenantId: ${userDoc.data().tenantId ?? '-'}`)

  for (const name of CHECK_COLLECTIONS) {
    const count = await getCountFromServer(query(collection(db, name), limit(1000)))
    console.log(`${name}: leitura ok (${count.data().count})`)
  }

  try {
    const validar = httpsCallable(functions, 'validarCertificado')
    await validar({ pfxBase64: '', senha: '' })
  } catch (err) {
    const code = err?.code ?? ''
    if (!String(code).includes('invalid-argument')) {
      throw new Error(`Functions não responderam como esperado: ${err?.message ?? err}`)
    }
    console.log('functions: ok (validarCertificado alcançável)')
  }

  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()
  const recalcularKpis = httpsCallable(functions, 'recalcularDashboardKpis')
  const kpisResult = await recalcularKpis({ mes, ano })
  const kpisData = kpisResult.data ?? {}
  if (typeof kpisData !== 'object' || !('totalClientesAtivos' in kpisData)) {
    throw new Error('Function recalcularDashboardKpis não retornou KPIs esperados.')
  }
  console.log(`functions: ok (recalcularDashboardKpis ${String(mes).padStart(2, '0')}/${ano})`)

  console.log('smoke-prod: ok')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
