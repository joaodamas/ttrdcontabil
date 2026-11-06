/**
 * Segundo fator (TOTP, aplicativo autenticador) — cadastro e interruptor.
 *
 * Pré-requisitos no console (docs/USUARIOS-PERMISSOES.md → "Segundo fator"):
 * Identity Platform habilitado e TOTP ligado no projeto. Sem isso o cadastro
 * falha com auth/operation-not-allowed e a tela explica.
 *
 * `configuracoes/seguranca.mfaObrigatorio` (padrão: false) liga a exigência
 * para administrador e fiscal: sem 2º fator, o AuthGuard leva à tela de
 * cadastro, e os callables sensíveis recusam sessão sem 2º fator. Só um admin
 * que entrou com 2º fator liga/desliga (regra de configuracoes).
 */
import {
  EmailAuthProvider,
  multiFactor,
  reauthenticateWithCredential,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  type TotpSecret,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

import { getClientAuth, getClientDb } from './firebase'
import { upsertDocument } from './firestore-client'

/** Perfis a quem o 2º fator e o logout por inatividade se aplicam. */
export const PERFIS_SEGURANCA_REFORCADA = ['admin', 'fiscal'] as const

export function perfilComSegurancaReforcada(perfil: string | null | undefined): boolean {
  return !!perfil && (PERFIS_SEGURANCA_REFORCADA as readonly string[]).includes(perfil)
}

export const NOME_EMISSOR_TOTP = 'JP Fiscal'
export const EVENTO_MFA_ALTERADO = 'mfa-alterado'

function usuarioAtual(): User {
  const user = getClientAuth().currentUser
  if (!user) throw new Error('Sessão expirada. Entre de novo.')
  return user
}

export function fatoresTotp(user: User | null = getClientAuth().currentUser) {
  if (!user) return []
  return multiFactor(user).enrolledFactors.filter((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID)
}

export function temSegundoFator(user: User | null = getClientAuth().currentUser): boolean {
  return fatoresTotp(user).length > 0
}

/** A sessão atual entrou com 2º fator? (claim do ID token) */
export async function sessaoComSegundoFator(): Promise<boolean> {
  const user = getClientAuth().currentUser
  if (!user) return false
  const token = await user.getIdTokenResult()
  return typeof token.signInSecondFactor === 'string' && token.signInSecondFactor.length > 0
}

/** Cadastrar/remover fator exige login recente: confirma a senha. */
export async function reautenticarComSenha(senha: string) {
  const user = usuarioAtual()
  if (!user.email) throw new Error('Conta sem e-mail.')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, senha))
}

export async function enviarVerificacaoEmail() {
  await sendEmailVerification(usuarioAtual())
}

/** Passo 1: segredo + URL otpauth:// para o QR Code. */
export async function iniciarCadastroTotp(): Promise<{ segredo: TotpSecret; otpauth: string; chave: string }> {
  const user = usuarioAtual()
  const sessao = await multiFactor(user).getSession()
  const segredo = await TotpMultiFactorGenerator.generateSecret(sessao)
  return {
    segredo,
    otpauth: segredo.generateQrCodeUrl(user.email ?? user.uid, NOME_EMISSOR_TOTP),
    chave: segredo.secretKey,
  }
}

/** Passo 2: confirma com o primeiro código do app e grava o fator. */
export async function concluirCadastroTotp(segredo: TotpSecret, codigo: string, nome = 'Aplicativo autenticador') {
  const user = usuarioAtual()
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(segredo, codigo.replace(/\D/g, ''))
  await multiFactor(user).enroll(assertion, nome)
  // Token novo já com o fator; avisa quem mostra o status.
  await user.getIdToken(true)
  window.dispatchEvent(new Event(EVENTO_MFA_ALTERADO))
}

export async function removerFator(fatorUid: string) {
  await multiFactor(usuarioAtual()).unenroll(fatorUid)
  window.dispatchEvent(new Event(EVENTO_MFA_ALTERADO))
}

/** Mensagem em português para os erros do fluxo de cadastro. */
export function mensagemErroMfa(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/requires-recent-login':
      return 'Por segurança, confirme sua senha antes de continuar.'
    case 'auth/unverified-email':
      return 'Confirme seu e-mail antes de cadastrar o 2º fator (enviamos o link de verificação).'
    case 'auth/invalid-verification-code':
      return 'Código incorreto ou expirado. Confira o relógio do celular e digite o código atual.'
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'O 2º fator ainda não foi habilitado no projeto (Identity Platform + TOTP). Fale com o administrador.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Senha incorreta.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos.'
    default:
      return (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.'
  }
}

// ─── Interruptor configuracoes/seguranca ─────────────────────────────────────

export const DOC_SEGURANCA = 'seguranca'

/** Doc ausente ou ilegível = desligado (nunca tranca ninguém por erro de leitura). */
export async function lerMfaObrigatorio(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'configuracoes', DOC_SEGURANCA))
    return snap.exists() && snap.get('mfaObrigatorio') === true
  } catch {
    return false
  }
}

/** Grava o interruptor (e o log de auditoria de `configuracoes`). */
export async function salvarMfaObrigatorio(valor: boolean, tenantId: string) {
  await upsertDocument('configuracoes', DOC_SEGURANCA, { mfaObrigatorio: valor, tenantId })
}
