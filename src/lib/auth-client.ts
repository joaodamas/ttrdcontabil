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

  // Try to fetch the Firestore profile. If the document doesn't exist yet
  // (e.g. user was created directly in Firebase Auth console), we still allow
  // login and fall back to safe defaults so the admin can set up the account.
  let nome = email
  let perfil = 'leitura'
  try {
    const snap = await getDoc(doc(db, 'usuarios', cred.user.uid))
    if (snap.exists()) {
      const data = snap.data()
      if (data.ativo === false) throw new Error('Usuário inativo. Contate o administrador.')
      nome   = data.nome   ?? email
      perfil = data.perfil ?? 'leitura'
    }
    // If document doesn't exist, proceed with defaults — admin should run seed
  } catch (err) {
    const msg = (err as { message?: string }).message ?? ''
    // Re-throw business errors (inactive user)
    if (msg.startsWith('Usuário inativo')) throw err
    // For permission/network errors reading the profile, still allow login
    // The user is authenticated with Firebase Auth — that's the source of truth
  }

  return {
    uid:    cred.user.uid,
    email:  cred.user.email ?? email,
    nome,
    perfil,
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}

export function onSession(callback: (session: UserSession | null) => void) {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (!user) { callback(null); return }
    // Firebase Auth is the source of truth — if the user is authenticated,
    // we always return a session. The Firestore profile is optional metadata.
    let nome = user.email ?? ''
    let perfil = 'leitura'
    try {
      const snap = await getDoc(doc(db, 'usuarios', user.uid))
      if (snap.exists()) {
        const data = snap.data()
        if (data.ativo === false) { callback(null); return }
        nome   = data.nome   ?? nome
        perfil = data.perfil ?? perfil
      }
    } catch {
      // Firestore unavailable — still allow access with defaults
    }
    callback({ uid: user.uid, email: user.email ?? '', nome, perfil })
  })
}
