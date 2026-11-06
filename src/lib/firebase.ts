import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

/** Alinhado ao app default do SDK (HMR / múltiplos imports). */
let appInstance: FirebaseApp | null = null

function logFirebaseConfigMissing(): void {
  const msg =
    '[Firebase] NEXT_PUBLIC_FIREBASE_API_KEY (e demais NEXT_PUBLIC_FIREBASE_*) ausentes. Configure .env.local ou o ambiente de deploy.'
  if (process.env.NODE_ENV === 'development') {
    console.error(msg)
  }
}

/**
 * Client SDK só no browser. Singleton: reutiliza `getApps()[0]` quando já existir.
 * Não chame no top-level do módulo — apenas dentro de handlers, hooks ou após mount.
 */
export function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error(
      '[Firebase] SDK de cliente não está disponível no servidor. Use apenas em código client-side.'
    )
  }
  const existing = getApps()[0]
  if (existing) {
    appInstance = existing
    return existing
  }
  if (appInstance) return appInstance

  if (!firebaseConfig.apiKey) {
    logFirebaseConfigMissing()
    throw new Error(
      '[Firebase] Configuração incompleta: defina NEXT_PUBLIC_FIREBASE_API_KEY e variáveis do projeto.'
    )
  }
  appInstance = initializeApp(firebaseConfig)
  conectarEmuladores(appInstance)
  return appInstance
}

/**
 * Com NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1: aponta Auth e Firestore para os
 * emuladores locais (dados fictícios, revisão visual, e2e). Em desenvolvimento
 * basta a variável; num BUILD (static export servido pelo emulador de hosting,
 * que é como o app roda em produção — e onde bugs como o do placeholder das
 * rotas [id] aparecem) exige também um projeto `demo-*`, que nunca existe na
 * nuvem. O build de produção não tem nenhuma das duas e nada muda.
 */
function conectarEmuladores(app: FirebaseApp): void {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== '1') return
  if (process.env.NODE_ENV !== 'development' && !app.options.projectId?.startsWith('demo-')) return
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080)
}

/** Sempre derivado do app atual — evita instâncias órfãs após hot reload. */
export function getClientAuth(): Auth {
  return getAuth(getFirebaseApp())
}

export function getClientDb(): Firestore {
  return getFirestore(getFirebaseApp())
}

export function getClientStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp())
}

/** @deprecated use getFirebaseApp() */
export default getFirebaseApp
