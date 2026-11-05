/**
 * Client-side auth helpers — uses Firebase Auth SDK directly.
 * No server, no session cookies, no API routes needed.
 *
 * O login do Firebase Auth NÃO basta para entrar: é preciso um perfil em
 * usuarios/{uid}, ativo e com perfil válido. Sem isso a sessão vira "sem
 * acesso" (tela explicando o motivo), nunca mais um perfil 'leitura'
 * inventado — antes, qualquer conta criada pelo cadastro público entrava
 * como leitura.
 *
 * O perfil é ouvido em tempo real (onSnapshot): desativar, excluir ou mudar
 * perfil/telas vale na hora, sem esperar novo login.
 */
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc, type DocumentData } from 'firebase/firestore'
import { getClientAuth, getClientDb } from './firebase'
import { ehPerfil } from './permissions'

export interface UserSession {
  uid: string
  email: string
  nome: string
  perfil: string
  tenantId?: string
  telas?: string[]   // granular screen access; undefined = use perfil defaults
}

export type SessaoEstado =
  | { tipo: 'anonimo' }
  | { tipo: 'ativo'; usuario: UserSession }
  | { tipo: 'sem_acesso'; motivo: string; email: string | null }

export const MOTIVO_SEM_PERFIL =
  'Sua conta não tem perfil de acesso neste escritório. Peça ao administrador para cadastrá-lo em Administração → Usuários.'
export const MOTIVO_INATIVO = 'Usuário inativo. Contate o administrador.'
export const MOTIVO_PERFIL_INVALIDO = 'Seu perfil de acesso está incompleto. Contate o administrador.'
export const MOTIVO_FALHA = 'Não foi possível verificar seu acesso. Tente entrar de novo em instantes.'

/**
 * Decide se o doc de perfil dá acesso. Puro (testado). `ativo` ausente conta
 * como ativo — mesma convenção de firestore.rules (isAtivo) e das functions.
 */
export function avaliarPerfil(
  uid: string,
  email: string | null,
  data: DocumentData | undefined | null,
): { ok: true; usuario: UserSession } | { ok: false; motivo: string } {
  if (!data) return { ok: false, motivo: MOTIVO_SEM_PERFIL }
  if (data.ativo === false) return { ok: false, motivo: MOTIVO_INATIVO }
  if (!ehPerfil(data.perfil)) return { ok: false, motivo: MOTIVO_PERFIL_INVALIDO }
  const usuario: UserSession = {
    uid,
    email: email ?? '',
    nome: (typeof data.nome === 'string' && data.nome) || email || '',
    perfil: data.perfil,
    tenantId: data.tenantId as string | undefined,
  }
  if (Array.isArray(data.telas)) usuario.telas = data.telas as string[]
  return { ok: true, usuario }
}

export async function signIn(email: string, password: string): Promise<UserSession> {
  const cred = await signInWithEmailAndPassword(getClientAuth(), email, password)
  const ref = doc(getClientDb(), 'usuarios', cred.user.uid)

  let resultado: ReturnType<typeof avaliarPerfil>
  try {
    const snap = await getDoc(ref)
    resultado = avaliarPerfil(cred.user.uid, cred.user.email ?? email, snap.exists() ? snap.data() : null)
  } catch {
    resultado = { ok: false, motivo: MOTIVO_FALHA }
  }
  if (!resultado.ok) {
    await firebaseSignOut(getClientAuth())
    throw new Error(resultado.motivo)
  }

  // Best-effort: as regras só aceitam a hora do servidor neste campo.
  updateDoc(ref, { ultimoAcesso: serverTimestamp() }).catch((err) => {
    console.warn('[auth] não foi possível registrar o último acesso', err)
  })
  return resultado.usuario
}

export async function signOut() {
  await firebaseSignOut(getClientAuth())
}

export function onSession(callback: (estado: SessaoEstado) => void) {
  const auth = getClientAuth()
  let pararPerfil: (() => void) | undefined
  // Quando a própria sessão derruba o login por falta de acesso, o próximo
  // "deslogado" do Auth deve virar a tela de sem acesso, não o login mudo.
  let motivoPendente: { motivo: string; email: string | null } | null = null
  let ultimo = ''

  function emitir(estado: SessaoEstado) {
    const chave = JSON.stringify(estado)
    if (chave === ultimo) return
    ultimo = chave
    callback(estado)
  }

  function negar(user: User, motivo: string) {
    motivoPendente = { motivo, email: user.email }
    pararPerfil?.()
    pararPerfil = undefined
    void firebaseSignOut(auth)
  }

  const pararAuth = onAuthStateChanged(auth, (user: User | null) => {
    pararPerfil?.()
    pararPerfil = undefined
    if (!user) {
      if (motivoPendente) {
        emitir({ tipo: 'sem_acesso', ...motivoPendente })
        motivoPendente = null
      } else {
        emitir({ tipo: 'anonimo' })
      }
      return
    }
    pararPerfil = onSnapshot(
      doc(getClientDb(), 'usuarios', user.uid),
      (snap) => {
        const r = avaliarPerfil(user.uid, user.email, snap.exists() ? snap.data() : null)
        if (r.ok) emitir({ tipo: 'ativo', usuario: r.usuario })
        else negar(user, r.motivo)
      },
      (err) => {
        console.error('[auth] perfil indisponível', err)
        negar(user, MOTIVO_FALHA)
      },
    )
  })

  return () => {
    pararPerfil?.()
    pararAuth()
  }
}
