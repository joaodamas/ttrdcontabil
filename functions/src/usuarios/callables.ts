/**
 * Ciclo de vida dos usuários do escritório — só administrador ativo, só pelo
 * servidor (Admin SDK). As regras do Firestore não deixam mais o navegador
 * criar/excluir perfis nem mudar perfil/telas/ativo/e-mail/tenant.
 *
 *   criarUsuario          → conta no Auth com senha aleatória que ninguém
 *                           conhece + usuarios/{uid}. O convite é o e-mail de
 *                           "definir senha" que o próprio front pede ao
 *                           Firebase logo depois (sendPasswordResetEmail).
 *   atualizarUsuario      → nome/perfil/telas/ativo; desativar também
 *                           desabilita o login no Auth e derruba as sessões.
 *   redefinirSenhaUsuario → confere e registra o pedido; o front dispara o
 *                           e-mail. O link nunca passa pelo admin.
 *   excluirUsuario        → apaga perfil e conta de login.
 *
 * Em todos: trava do último administrador e log em logs_auditoria gravado na
 * mesma transação da mudança.
 */
import { randomBytes } from 'node:crypto'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { atorDaRequisicao, montarAuditLog, requisicaoDoCallable } from '../audit'
import { assertAdmin } from '../authz'
import { logErro } from '../log'
import { exigirSegundoFatorSeObrigatorio } from '../seguranca/mfa'
import {
  ErroRegraUsuario,
  camposAlterados,
  resumoParaAuditoria,
  validarEntradaAtualizar,
  validarEntradaCriar,
  validarUid,
  verificarMudanca,
  type UsuarioResumo,
} from './regras'

const db = () => admin.firestore()
const OPCOES = { region: 'southamerica-east1', timeoutSeconds: 30, invoker: 'public' as const }

function traduzirErro(err: unknown): never {
  if (err instanceof ErroRegraUsuario) throw new HttpsError(err.codigo, err.message)
  throw err
}

type RequisicaoCallable = Parameters<typeof atorDaRequisicao>[0]

/** Admin ativo do tenant + 2º fator quando configuracoes/seguranca o exige. */
async function autorizarAdmin(request: RequisicaoCallable, mensagem: string) {
  const quem = await assertAdmin(request.auth?.uid, mensagem)
  await exigirSegundoFatorSeObrigatorio(request.auth)
  return quem
}

// Ator e origem do log: nome/e-mail do token (não do perfil, que o usuário
// edita) + IP e navegador da chamada.
function logDe(request: RequisicaoCallable) {
  return { actor: atorDaRequisicao(request), requisicao: requisicaoDoCallable(request) }
}

// Senha que ninguém conhece: a conta nasce com provedor de senha (o e-mail de
// redefinição funciona), mas só quem recebe o convite define a senha real.
function senhaAleatoria() {
  return `${randomBytes(24).toString('base64url')}Aa1!`
}

function codigoAuth(err: unknown): string {
  return String((err as { code?: string })?.code ?? '')
}

async function adminsDoTenant(
  tx: FirebaseFirestore.Transaction,
  tenantId: string,
): Promise<UsuarioResumo[]> {
  const snap = await tx.get(
    db().collection('usuarios').where('tenantId', '==', tenantId).where('perfil', '==', 'admin'),
  )
  return snap.docs.map((d) => ({ uid: d.id, perfil: d.get('perfil'), ativo: d.get('ativo') }))
}

/** Perfil do alvo, exigindo que seja do mesmo tenant de quem chama. */
async function carregarAlvo(tx: FirebaseFirestore.Transaction, uid: string, tenantId: string) {
  const ref = db().collection('usuarios').doc(uid)
  const snap = await tx.get(ref)
  // Outro tenant responde igual a inexistente: não confirma que o uid existe.
  if (!snap.exists || snap.get('tenantId') !== tenantId) {
    throw new HttpsError('not-found', 'Usuário não encontrado.')
  }
  return { ref, dados: snap.data() ?? {} }
}

// ─── criarUsuario ─────────────────────────────────────────────────────────────

export const criarUsuario = onCall(OPCOES, async (request) => {
  const quem = await autorizarAdmin(request, 'Apenas administradores criam usuários.')
  let entrada
  try {
    entrada = validarEntradaCriar(request.data)
  } catch (err) {
    traduzirErro(err)
  }

  const auth = admin.auth()
  const existente = await auth.getUserByEmail(entrada.email).catch((err) => {
    if (codigoAuth(err) === 'auth/user-not-found') return null
    throw err
  })

  let uid: string
  let criadoAgora = false
  if (existente) {
    const perfil = await db().collection('usuarios').doc(existente.uid).get()
    if (perfil.exists) {
      // Mesmo texto para "deste" e de "outro" escritório: não revela qual.
      throw new HttpsError('already-exists', 'Já existe um usuário com este e-mail.')
    }
    // Conta de login sem perfil: sobra do cadastro antigo pelo navegador (que
    // criava o login e falhava no perfil) ou de um cadastro público. Reaproveita
    // o uid, mas zera a senha (quem a criou deixa de entrar), reabilita e derruba
    // as sessões — a partir daqui só o dono do e-mail, pelo convite, define a senha.
    await auth.updateUser(existente.uid, { password: senhaAleatoria(), disabled: false, displayName: entrada.nome })
    await auth.revokeRefreshTokens(existente.uid)
    uid = existente.uid
  } else {
    try {
      const novo = await auth.createUser({
        email: entrada.email,
        password: senhaAleatoria(),
        displayName: entrada.nome,
        disabled: false,
      })
      uid = novo.uid
      criadoAgora = true
    } catch (err) {
      if (codigoAuth(err) === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Já existe um usuário com este e-mail.')
      }
      if (codigoAuth(err) === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'E-mail inválido.')
      throw err
    }
  }

  const perfilDoc = {
    nome: entrada.nome,
    email: entrada.email,
    perfil: entrada.perfil,
    telas: entrada.telas,
    ativo: true,
    tenantId: quem.tenantId,
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
    criadoPorId: quem.id,
    criadoPorNome: quem.nome,
  }

  try {
    const batch = db().batch()
    // create() e não set(): se outro admin criou o mesmo uid nesse meio-tempo, falha.
    batch.create(db().collection('usuarios').doc(uid), perfilDoc)
    batch.set(
      db().collection('logs_auditoria').doc(),
      montarAuditLog({
        tenantId: quem.tenantId,
        ...logDe(request),
        entidade: 'usuarios',
        entidadeId: uid,
        acao: existente ? 'usuario_criado_conta_existente' : 'usuario_criado',
        dadosAntes: null,
        dadosDepois: resumoParaAuditoria(perfilDoc),
        origem: 'cloud_function',
      }),
    )
    await batch.commit()
  } catch (err) {
    // Sem órfão: o login criado agora sai junto com o perfil que falhou.
    if (criadoAgora) {
      await auth.deleteUser(uid).catch((e) => logErro('[criarUsuario][falha-desfazer-conta]', { uid }, e))
    }
    logErro('[criarUsuario][falha-gravar-perfil]', { uid }, err)
    throw new HttpsError('internal', 'Não foi possível criar o usuário. Nada foi gravado; tente novamente.')
  }

  return { uid, email: entrada.email, contaReaproveitada: !!existente }
})

// ─── atualizarUsuario ─────────────────────────────────────────────────────────

export const atualizarUsuario = onCall(OPCOES, async (request) => {
  const quem = await autorizarAdmin(request, 'Apenas administradores alteram usuários.')
  let entrada
  try {
    entrada = validarEntradaAtualizar(request.data)
  } catch (err) {
    traduzirErro(err)
  }
  const { uid, alteracoes } = entrada

  const resultado = await db().runTransaction(async (tx) => {
    const alvo = await carregarAlvo(tx, uid, quem.tenantId)
    const antes = alvo.dados
    const depois = { ...antes, ...alteracoes }
    const mexeNoAcesso = alteracoes.perfil !== undefined || alteracoes.ativo !== undefined
    const admins = mexeNoAcesso ? await adminsDoTenant(tx, quem.tenantId) : []
    try {
      if (mexeNoAcesso) {
        verificarMudanca({ atorUid: quem.id, alvoUid: uid, antes, depois, adminsDoTenant: admins })
      }
    } catch (err) {
      traduzirErro(err)
    }

    const alterados = camposAlterados(antes, alteracoes)
    if (alterados.length === 0) return { alterados, email: antes.email as string | undefined }

    tx.update(alvo.ref, {
      ...alteracoes,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPorId: quem.id,
      atualizadoPorNome: quem.nome,
    })
    tx.set(
      db().collection('logs_auditoria').doc(),
      montarAuditLog({
        tenantId: quem.tenantId,
        ...logDe(request),
        entidade: 'usuarios',
        entidadeId: uid,
        acao: alteracoes.ativo === false && antes.ativo !== false
          ? 'usuario_desativado'
          : alteracoes.ativo === true && antes.ativo === false
            ? 'usuario_reativado'
            : 'usuario_atualizado',
        dadosAntes: resumoParaAuditoria(antes),
        dadosDepois: resumoParaAuditoria(depois),
        origem: 'cloud_function',
      }),
    )
    return { alterados, email: antes.email as string | undefined }
  })

  // Auth depois do Firestore: o perfil já manda (as regras negam inativo). Se o
  // Auth falhar, repetir a mesma chamada é seguro — ela reaplica o estado.
  try {
    const auth = admin.auth()
    if (alteracoes.ativo !== undefined || alteracoes.nome !== undefined) {
      await auth.updateUser(uid, {
        ...(alteracoes.ativo !== undefined ? { disabled: !alteracoes.ativo } : {}),
        ...(alteracoes.nome !== undefined ? { displayName: alteracoes.nome } : {}),
      })
    }
    if (alteracoes.ativo === false) await auth.revokeRefreshTokens(uid)
  } catch (err) {
    if (codigoAuth(err) !== 'auth/user-not-found') {
      logErro('[atualizarUsuario][falha-auth]', { uid }, err)
      throw new HttpsError(
        'internal',
        'O perfil foi salvo, mas o login não foi atualizado. Repita a operação para concluir.',
      )
    }
  }

  return { uid, alterados: resultado.alterados }
})

// ─── redefinirSenhaUsuario ────────────────────────────────────────────────────

export const redefinirSenhaUsuario = onCall(OPCOES, async (request) => {
  const quem = await autorizarAdmin(request, 'Apenas administradores reenviam convites.')
  let uid: string
  try {
    uid = validarUid((request.data as { uid?: unknown } | undefined)?.uid)
  } catch (err) {
    traduzirErro(err)
  }

  const email = await db().runTransaction(async (tx) => {
    const alvo = await carregarAlvo(tx, uid, quem.tenantId)
    if (alvo.dados.ativo === false) {
      throw new HttpsError('failed-precondition', 'Usuário inativo. Reative-o antes de reenviar o convite.')
    }
    tx.set(
      db().collection('logs_auditoria').doc(),
      montarAuditLog({
        tenantId: quem.tenantId,
        ...logDe(request),
        entidade: 'usuarios',
        entidadeId: uid,
        acao: 'usuario_convite_reenviado',
        dadosAntes: null,
        dadosDepois: null,
        origem: 'cloud_function',
      }),
    )
    return alvo.dados.email as string | undefined
  })

  // O e-mail da conta de login é a fonte: é para ele que o Firebase manda o link.
  const conta = await admin.auth().getUser(uid).catch((err) => {
    if (codigoAuth(err) === 'auth/user-not-found') return null
    throw err
  })
  if (!conta?.email) {
    throw new HttpsError('failed-precondition', 'Este usuário não tem conta de login. Exclua-o e crie de novo.')
  }
  if (conta.disabled) await admin.auth().updateUser(uid, { disabled: false })
  return { uid, email: conta.email ?? email }
})

// ─── excluirUsuario ───────────────────────────────────────────────────────────

export const excluirUsuario = onCall(OPCOES, async (request) => {
  const quem = await autorizarAdmin(request, 'Apenas administradores excluem usuários.')
  let uid: string
  try {
    uid = validarUid((request.data as { uid?: unknown } | undefined)?.uid)
  } catch (err) {
    traduzirErro(err)
  }

  await db().runTransaction(async (tx) => {
    const alvo = await carregarAlvo(tx, uid, quem.tenantId)
    const admins = await adminsDoTenant(tx, quem.tenantId)
    try {
      verificarMudanca({ atorUid: quem.id, alvoUid: uid, antes: alvo.dados, depois: null, adminsDoTenant: admins })
    } catch (err) {
      traduzirErro(err)
    }
    tx.delete(alvo.ref)
    tx.set(
      db().collection('logs_auditoria').doc(),
      montarAuditLog({
        tenantId: quem.tenantId,
        ...logDe(request),
        entidade: 'usuarios',
        entidadeId: uid,
        acao: 'usuario_excluido',
        dadosAntes: resumoParaAuditoria(alvo.dados),
        dadosDepois: null,
        origem: 'cloud_function',
      }),
    )
  })

  try {
    await admin.auth().deleteUser(uid)
  } catch (err) {
    if (codigoAuth(err) !== 'auth/user-not-found') {
      // Perfil já saiu (sem perfil não há acesso). Ao menos tranca o login; a
      // conta que sobrar é reaproveitada se o e-mail for cadastrado de novo.
      await admin.auth().updateUser(uid, { disabled: true }).catch(() => undefined)
      logErro('[excluirUsuario][falha-apagar-login]', { uid }, err)
    }
  }
  return { uid }
})
