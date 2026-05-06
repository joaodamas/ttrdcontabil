/**
 * Usa a API REST do Firebase para garantir o documento /usuarios/{uid}
 * com perfil admin — não depende das regras do Firestore para leitura.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const PROJECT_ID = 'ttrdcontabil-jpproject'
const EMAIL = 'joaodamasit@gmail.com'
const PASSWORD = process.env.ADMIN_PASSWORD

const firebaseConfig = {
  apiKey: 'AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8',
  authDomain: 'ttrdcontabil-jpproject.firebaseapp.com',
  projectId: PROJECT_ID,
}

async function main() {
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)

  console.log('🔐 Fazendo login...')
  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  const uid = cred.user.uid
  const idToken = await cred.user.getIdToken()
  console.log('✅ UID:', uid)

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/usuarios/${uid}?updateMask.fieldPaths=nome&updateMask.fieldPaths=email&updateMask.fieldPaths=perfil&updateMask.fieldPaths=ativo`

  // Tenta PATCH (atualizar ou criar)
  const body = {
    fields: {
      nome:   { stringValue: 'João Damas' },
      email:  { stringValue: EMAIL },
      perfil: { stringValue: 'admin' },
      ativo:  { booleanValue: true },
    },
  }

  console.log('📝 Escrevendo documento via REST...')
  const res = await fetch(
    url,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()

  if (!res.ok) {
    console.error('❌ Erro HTTP', res.status, JSON.stringify(data, null, 2))
    process.exit(1)
  }

  console.log('✅ Documento salvo!')
  console.log('   perfil:', data.fields?.perfil?.stringValue)
  console.log('\n🎉 Faça logout e login novamente no app para ver o perfil admin.')
  process.exit(0)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
