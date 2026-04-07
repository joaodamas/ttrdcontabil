/**
 * Client-side auth helpers — uses Firebase Auth SDK directly.
 * No server, no session cookies, no API routes needed.
 */
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

export interface UserSession {
  uid: string
  email: string
  nome: string
  perfil: string
}

export async function signIn(email: string, password: string): Promise<UserSession> {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  const snap = await getDoc(doc(db, 'usuarios', cred.user.uid))
  if (!snap.exists()) throw new Error('Usuário não encontrado no sistema')
  const data = snap.data()
  if (data.ativo === false) throw new Error('Usuário inativo')
  return {
    uid:    cred.user.uid,
    email:  cred.user.email ?? email,
    nome:   data.nome ?? email,
    perfil: data.perfil ?? 'leitura',
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}

export function onSession(callback: (session: UserSession | null) => void) {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (!user) { callback(null); return }
    try {
      const snap = await getDoc(doc(db, 'usuarios', user.uid))
      if (!snap.exists()) { callback(null); return }
      const data = snap.data()
      callback({
        uid:    user.uid,
        email:  user.email ?? '',
        nome:   data.nome ?? '',
        perfil: data.perfil ?? 'leitura',
      })
    } catch {
      callback(null)
    }
  })
}
