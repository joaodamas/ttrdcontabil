/**
 * Cria/atualiza o documento /usuarios/{uid} com perfil "admin"
 * para o usuário joaodamasit@gmail.com.
 *
 * Uso:
 *   node scripts/setup-admin.mjs
 *   ou passando senha via env:
 *   ADMIN_PASSWORD=suasenha node scripts/setup-admin.mjs
 */

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const firebaseConfig = {
  apiKey: 'AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8',
  authDomain: 'ttrdcontabil-jpproject.firebaseapp.com',
  projectId: 'ttrdcontabil-jpproject',
  storageBucket: 'ttrdcontabil-jpproject.firebasestorage.app',
  messagingSenderId: '1077611965156',
  appId: '1:1077611965156:web:adf49df9b1e34982df1af1',
}

const EMAIL = 'joaodamasit@gmail.com'

async function main() {
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)

  let password = process.env.ADMIN_PASSWORD
  if (!password) {
    const rl = readline.createInterface({ input, output })
    password = await rl.question(`Senha para ${EMAIL}: `)
    rl.close()
  }

  console.log('🔐 Fazendo login...')
  const cred = await signInWithEmailAndPassword(auth, EMAIL, password)
  const uid = cred.user.uid
  console.log(`✅ Logado! UID: ${uid}`)

  const usuarioRef = doc(db, 'usuarios', uid)
  await setDoc(usuarioRef, {
    nome: 'João Damas',
    email: EMAIL,
    perfil: 'admin',
  }, { merge: true })

  console.log('✅ Documento /usuarios/' + uid + ' criado com perfil "admin"!')
  console.log('🎉 Recarregue o app — você verá todos os grupos do sidebar.')
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erro:', err.message)
  process.exit(1)
})
