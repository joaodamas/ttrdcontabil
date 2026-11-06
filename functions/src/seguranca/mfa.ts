/**
 * Segundo fator (TOTP) nas operações sensíveis — atrás de um interruptor.
 *
 * `configuracoes/seguranca.mfaObrigatorio` (padrão: desligado). Enquanto
 * desligado nada muda: ninguém fica trancado antes de o Identity Platform e o
 * TOTP estarem habilitados no console. Ligado, os callables de usuários,
 * senhas de portal e certificado A1 exigem que a sessão tenha entrado com o
 * segundo fator (claim `firebase.sign_in_second_factor` do ID token, assinada
 * pelo Google — o navegador não forja).
 *
 * Só administrador e fiscal chamam esses callables; o front leva quem não
 * cadastrou o 2º fator para /conta/seguranca.
 */
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

export const DOC_SEGURANCA = 'seguranca'
const CACHE_MS = 60_000

let cache: { valor: boolean; em: number } | null = null

/** Lê o interruptor (cache de 1 min por instância). */
export async function mfaObrigatorio(): Promise<boolean> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.valor
  const snap = await getFirestore().collection('configuracoes').doc(DOC_SEGURANCA).get()
  const valor = snap.exists && snap.get('mfaObrigatorio') === true
  cache = { valor, em: Date.now() }
  return valor
}

type AuthComToken = { uid: string; token?: Record<string, unknown> } | null | undefined

/** A sessão entrou com segundo fator? (puro — testado) */
export function sessaoComSegundoFator(auth: AuthComToken): boolean {
  const firebase = auth?.token?.firebase as { sign_in_second_factor?: unknown } | undefined
  return typeof firebase?.sign_in_second_factor === 'string' && firebase.sign_in_second_factor.length > 0
}

export const MENSAGEM_MFA =
  'Esta operação exige login com segundo fator (aplicativo autenticador). Cadastre-o em Minha conta → Segurança e entre de novo.'

/** Lança permission-denied quando o interruptor está ligado e a sessão não tem 2º fator. */
export async function exigirSegundoFatorSeObrigatorio(auth: AuthComToken): Promise<void> {
  if (!(await mfaObrigatorio())) return
  if (!sessaoComSegundoFator(auth)) throw new HttpsError('permission-denied', MENSAGEM_MFA)
}
