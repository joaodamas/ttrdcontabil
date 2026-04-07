import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getStorage, Storage } from 'firebase-admin/storage'

let _app: App | null = null

function getAdminApp(): App {
  if (_app) return _app
  if (getApps().length > 0) {
    _app = getApps()[0]
    return _app
  }

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY

  if (serviceAccountKey) {
    // Local dev: use explicit service account key
    const serviceAccount = JSON.parse(serviceAccountKey)
    _app = initializeApp({ credential: cert(serviceAccount), storageBucket })
  } else {
    // Firebase App Hosting / Cloud Run: use Application Default Credentials
    _app = initializeApp({ credential: applicationDefault(), storageBucket })
  }

  return _app
}

// Lazy getters — initialization only happens when first used (not at import time)
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp())
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp())
}

// Convenience re-exports for backwards compat (lazily resolved on first property access)
export const adminAuth = new Proxy({} as Auth, {
  get(_t, prop) {
    return (getAdminAuth() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export const adminDb = new Proxy({} as Firestore, {
  get(_t, prop) {
    return (getAdminDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export const adminStorage = new Proxy({} as Storage, {
  get(_t, prop) {
    return (getAdminStorage() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
