import { cookies } from 'next/headers'
import { adminAuth, adminDb } from './firebase-admin'

export interface UserSession {
  uid: string
  email: string
  nome: string
  perfil: string
}

/**
 * Verifica o Firebase ID token enviado no cookie e retorna os dados do usuário.
 * Retorna null se não autenticado ou token inválido.
 */
export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ttrd_session')?.value
    if (!token) return null

    // Verifica o session cookie do Firebase
    const decoded = await adminAuth.verifySessionCookie(token, true)

    // Busca perfil do usuário no Firestore
    const userDoc = await adminDb.collection('usuarios').doc(decoded.uid).get()
    if (!userDoc.exists) return null

    const userData = userDoc.data()!
    if (!userData.ativo) return null

    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      nome: userData.nome ?? '',
      perfil: userData.perfil ?? 'leitura',
    }
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<UserSession> {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHORIZED')
  return session
}

export async function requireAdmin(): Promise<UserSession> {
  const session = await requireAuth()
  if (session.perfil !== 'admin') throw new Error('FORBIDDEN')
  return session
}

export function canAccess(perfil: string, recurso: string, acao: string): boolean {
  if (perfil === 'admin') return true
  if (perfil === 'leitura') return acao === 'read'

  const permissoes: Record<string, Record<string, string[]>> = {
    operacional: {
      clientes: ['read', 'create', 'update'],
      servicos: ['read', 'create', 'update'],
      competencias: ['read', 'create', 'update'],
      tarefas: ['read', 'create', 'update', 'delete'],
      ir: ['read', 'create', 'update'],
      documentos: ['read', 'create'],
    },
    fiscal: {
      clientes: ['read'],
      competencias: ['read'],
      fiscal: ['read', 'create', 'update'],
      nfse: ['read', 'create', 'update', 'emit'],
      documentos: ['read', 'create'],
    },
    financeiro: {
      clientes: ['read'],
      lancamentos: ['read', 'create', 'update'],
      nfse: ['read'],
      documentos: ['read'],
    },
  }

  const perfilPerms = permissoes[perfil]
  if (!perfilPerms) return false
  const recursoPerms = perfilPerms[recurso]
  return !!recursoPerms?.includes(acao)
}
