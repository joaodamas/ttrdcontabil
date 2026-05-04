import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8',
  authDomain: 'ttrdcontabil-jpproject.firebaseapp.com',
  projectId: 'ttrdcontabil-jpproject',
  storageBucket: 'ttrdcontabil-jpproject.firebasestorage.app',
  messagingSenderId: '1077611965156',
  appId: '1:1077611965156:web:adf49df9b1e34982df1af1',
}

const EMAIL = 'joaodamasit@gmail.com'
const PASSWORD = process.env.ADMIN_PASSWORD

async function main() {
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)

  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  const uid = cred.user.uid
  console.log('UID:', uid)

  const snap = await getDoc(doc(db, 'usuarios', uid))
  if (!snap.exists()) {
    console.log('❌ Documento NÃO existe — criando agora...')
    await setDoc(doc(db, 'usuarios', uid), {
      nome: 'João Damas',
      email: EMAIL,
      perfil: 'admin',
    })
    const snap2 = await getDoc(doc(db, 'usuarios', uid))
    console.log('✅ Criado:', snap2.data())
  } else {
    console.log('📄 Documento atual:', snap.data())
    if (snap.data().perfil !== 'admin') {
      console.log('⚠️  Perfil errado, corrigindo...')
      await setDoc(doc(db, 'usuarios', uid), { perfil: 'admin' }, { merge: true })
      console.log('✅ Perfil atualizado para admin')
    } else {
      console.log('✅ Perfil já é admin — faça logout e login novamente no app')
    }
  }
  process.exit(0)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
