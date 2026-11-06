import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireEnvironmentTenant } from './tenant'
import { PERFIS, podeLerNfse, type Perfil } from './usuarios/perfis'

const db = () => getFirestore()

type AcaoCliente = 'read' | 'write' | 'fiscal' | 'financeiro' | 'nfse' | 'admin'

// 'nfse' é tratado à parte (podeLerNfse): além do perfil, aceita a tela
// 'fiscal' concedida ao usuário — o mesmo critério de canReadNfse() nas regras.
const PERFIS_POR_ACAO: Record<Exclude<AcaoCliente, 'nfse'>, readonly Perfil[]> = {
  read: PERFIS,
  write: ['admin', 'operacional'],
  fiscal: ['admin', 'fiscal'],
  financeiro: ['admin', 'financeiro'],
  admin: ['admin'],
}

export interface UsuarioAutorizado {
  id: string
  nome: string
  email: string | null
  perfil: Perfil
  telas: string[] | null
  tenantId: string
}

/**
 * Carrega o perfil de quem chama e exige que exista, esteja ativo e pertença
 * ao ambiente. Única cópia desta checagem nas functions — antes cada módulo
 * tinha a sua (dashboard, fechamento, rascunhos).
 *
 * `ativo` ausente conta como ativo, como em firestore.rules (isAtivo) e no
 * front: perfis antigos criados por script não têm o campo.
 */
export async function carregarUsuarioAtivo(uid: string | undefined): Promise<UsuarioAutorizado> {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  const snap = await db().collection('usuarios').doc(uid).get()
  if (!snap.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const usuario = snap.data() ?? {}
  if (usuario.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')
  const perfil = usuario.perfil
  if (!(PERFIS as readonly unknown[]).includes(perfil)) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para esta operação.')
  }
  return {
    id: uid,
    nome: (usuario.nome as string | undefined) ?? uid,
    email: (usuario.email as string | undefined) ?? null,
    perfil: perfil as Perfil,
    telas: Array.isArray(usuario.telas) ? (usuario.telas as string[]) : null,
    tenantId: requireEnvironmentTenant(usuario.tenantId, 'Usuário'),
  }
}

/** Usuário ativo com um dos perfis listados. */
export async function assertPerfil(
  uid: string | undefined,
  perfis: readonly Perfil[],
  mensagem = 'Perfil sem permissão para esta operação.',
): Promise<UsuarioAutorizado> {
  const usuario = await carregarUsuarioAtivo(uid)
  if (!perfis.includes(usuario.perfil)) throw new HttpsError('permission-denied', mensagem)
  return usuario
}

export function assertAdmin(uid: string | undefined, mensagem = 'Apenas administradores podem fazer esta operação.') {
  return assertPerfil(uid, ['admin'], mensagem)
}

export async function assertCanAccessCliente(uid: string, clienteId: string | undefined, acao: AcaoCliente) {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  if (!clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')

  const usuario = await carregarUsuarioAtivo(uid)
  const permitido = acao === 'nfse' ? podeLerNfse(usuario) : PERFIS_POR_ACAO[acao].includes(usuario.perfil)
  if (!permitido) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para esta operação.')
  }

  const clienteDoc = await db().collection('clientes').doc(clienteId).get()
  if (!clienteDoc.exists) {
    throw new HttpsError('not-found', 'Cliente não encontrado.')
  }

  const cliente = clienteDoc.data() ?? {}
  const clienteTenant = cliente.tenantId as string | undefined
  if (clienteTenant !== usuario.tenantId) {
    throw new HttpsError('permission-denied', 'Cliente pertence a outro tenant.')
  }

  return {
    usuario: { id: uid, nome: usuario.nome, perfil: usuario.perfil, tenantId: usuario.tenantId },
    cliente: { id: clienteDoc.id, ...cliente },
  }
}
