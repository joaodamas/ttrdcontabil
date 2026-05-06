import * as admin from 'firebase-admin'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireEnvironmentTenant } from './tenant'

const db = () => admin.firestore()

type AcaoCliente = 'read' | 'write' | 'fiscal' | 'financeiro' | 'admin'

const PERFIS_POR_ACAO: Record<AcaoCliente, string[]> = {
  read: ['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'],
  write: ['admin', 'operacional'],
  fiscal: ['admin', 'fiscal'],
  financeiro: ['admin', 'financeiro'],
  admin: ['admin'],
}

export async function assertCanAccessCliente(uid: string, clienteId: string | undefined, acao: AcaoCliente) {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
  if (!clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')

  const usuarioDoc = await db().collection('usuarios').doc(uid).get()
  if (!usuarioDoc.exists) {
    throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  }

  const usuario = usuarioDoc.data() ?? {}
  if (usuario.ativo === false) {
    throw new HttpsError('permission-denied', 'Usuário inativo.')
  }

  const perfil = usuario.perfil as string | undefined
  if (!perfil || !PERFIS_POR_ACAO[acao].includes(perfil)) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para esta operação.')
  }

  const usuarioTenant = requireEnvironmentTenant(usuario.tenantId, 'Usuário')

  const clienteDoc = await db().collection('clientes').doc(clienteId).get()
  if (!clienteDoc.exists) {
    throw new HttpsError('not-found', 'Cliente não encontrado.')
  }

  const cliente = clienteDoc.data() ?? {}
  const clienteTenant = cliente.tenantId as string | undefined
  if (clienteTenant !== usuarioTenant) {
    throw new HttpsError('permission-denied', 'Cliente pertence a outro tenant.')
  }

  return {
    usuario: { id: uid, nome: (usuario.nome as string | undefined) ?? uid, perfil, tenantId: usuarioTenant },
    cliente: { id: clienteDoc.id, ...cliente },
  }
}
