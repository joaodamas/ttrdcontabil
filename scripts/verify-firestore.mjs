import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const PROJECT_ID = 'ttrdcontabil-jpproject'
const EMAIL = 'joaodamasit@gmail.com'
const PASSWORD = process.env.ADMIN_PASSWORD

initializeApp({ apiKey: 'AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8', authDomain: 'ttrdcontabil-jpproject.firebaseapp.com', projectId: PROJECT_ID })

async function main() {
  const cred = await signInWithEmailAndPassword(getAuth(), EMAIL, PASSWORD)
  const uid = cred.user.uid
  const token = await cred.user.getIdToken()

  // GET the document via REST
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/usuarios/${uid}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  console.log('HTTP', res.status)
  console.log(JSON.stringify(data, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
