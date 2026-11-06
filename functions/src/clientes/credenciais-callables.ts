/**
 * Senhas de portal do cliente (clientes_credenciais/{clienteId}) — só pelo
 * servidor desde 2026-11-06.
 *
 * Antes o navegador de admin/fiscal lia e gravava o doc direto, em texto puro,
 * e a tela de clientes listava até 2000 de uma vez sem deixar rastro. Agora:
 *
 *   lerCredenciaisCliente      → decifra e devolve as senhas de UM cliente
 *                                (opcionalmente só alguns campos). Cada chamada
 *                                é uma "revelação" e grava log com IP.
 *   salvarCredenciaisCliente   → cifra (AES-256-GCM, CREDENTIAL_KEY) e grava;
 *                                tira a senha legada de `clientes` se sobrou.
 *   exportarCredenciaisClientes→ relatório com senhas (só admin), auditado.
 *
 * As regras negam leitura e escrita de clientes_credenciais ao navegador.
 * O trigger sincronizarCredenciaisPreenchidas continua mantendo
 * `clientes.credenciaisPreenchidas` (só os nomes dos campos).
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

import { atorDaRequisicao, montarAuditLog, requisicaoDoCallable } from '../audit'
import { assertAdmin, assertPerfil, type UsuarioAutorizado } from '../authz'
import { decrypt, encrypt } from '../nfse/encrypt'
import { credentialSecrets } from '../nfse/secrets'
import { exigirSegundoFatorSeObrigatorio } from '../seguranca/mfa'
import { PERFIS_CREDENCIAIS } from '../usuarios/perfis'
import { CAMPOS_CREDENCIAL_LISTA, camposPreenchidos } from './credenciais-campos'
import {
  ErroCredencial,
  abrirCredenciais,
  validarCamposLeitura,
  validarClienteId,
  validarCredenciaisParaSalvar,
} from './credenciais-regras'

const db = () => getFirestore()
const OPCOES = {
  region: 'southamerica-east1',
  timeoutSeconds: 30,
  invoker: 'public' as const,
  secrets: credentialSecrets,
}
const LIMITE_EXPORTACAO = 2000

function erroDeEntrada(err: unknown): never {
  if (err instanceof ErroCredencial) throw new HttpsError('invalid-argument', err.message)
  throw err
}

async function autorizar(request: CallableRequest, apenasAdmin = false): Promise<UsuarioAutorizado> {
  const usuario = apenasAdmin
    ? await assertAdmin(request.auth?.uid, 'Apenas administradores exportam as senhas de portal.')
    : await assertPerfil(request.auth?.uid, PERFIS_CREDENCIAIS, 'Apenas administrador e fiscal acessam as senhas de portal.')
  await exigirSegundoFatorSeObrigatorio(request.auth)
  return usuario
}

/** Cliente do mesmo tenant; outro tenant responde igual a inexistente. */
async function carregarCliente(clienteId: string, tenantId: string) {
  const snap = await db().collection('clientes').doc(clienteId).get()
  if (!snap.exists || snap.get('tenantId') !== tenantId) {
    throw new HttpsError('not-found', 'Cliente não encontrado.')
  }
  return snap
}

function decifrar(valor: string): string | null {
  return decrypt(valor)
}

// ─── lerCredenciaisCliente ────────────────────────────────────────────────────

export const lerCredenciaisCliente = onCall(OPCOES, async (request) => {
  const usuario = await autorizar(request)
  let clienteId: string
  let campos
  try {
    clienteId = validarClienteId((request.data as { clienteId?: unknown } | undefined)?.clienteId)
    campos = validarCamposLeitura((request.data as { campos?: unknown } | undefined)?.campos)
  } catch (err) {
    erroDeEntrada(err)
  }
  await carregarCliente(clienteId, usuario.tenantId)

  const snap = await db().collection('clientes_credenciais').doc(clienteId).get()
  const dados = snap.exists ? snap.data() ?? {} : null
  const { valores, ilegiveis } = abrirCredenciais(dados, campos, decifrar)

  // Sem log, sem senha: se o registro da revelação falhar, nada é devolvido.
  await db().collection('logs_auditoria').add(
    montarAuditLog({
      tenantId: usuario.tenantId,
      actor: atorDaRequisicao(request),
      requisicao: requisicaoDoCallable(request),
      entidade: 'clientes_credenciais',
      entidadeId: clienteId,
      acao: 'credenciais_reveladas',
      dadosAntes: null,
      dadosDepois: { campos: Object.keys(valores), ilegiveis },
      origem: 'cloud_function',
    }),
  )

  return { clienteId, credenciais: valores, ilegiveis }
})

// ─── salvarCredenciaisCliente ─────────────────────────────────────────────────

export const salvarCredenciaisCliente = onCall(OPCOES, async (request) => {
  const usuario = await autorizar(request)
  let clienteId: string
  let entrada
  try {
    clienteId = validarClienteId((request.data as { clienteId?: unknown } | undefined)?.clienteId)
    entrada = validarCredenciaisParaSalvar((request.data as { credenciais?: unknown } | undefined)?.credenciais)
  } catch (err) {
    erroDeEntrada(err)
  }
  const cliente = await carregarCliente(clienteId, usuario.tenantId)

  const ref = db().collection('clientes_credenciais').doc(clienteId)
  const actor = atorDaRequisicao(request)

  const resultado = await db().runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    const antes = atual.exists ? atual.data() ?? {} : {}
    // Só o que muda de fato: regravar a mesma senha não gera log nem escrita.
    const { valores: abertos } = abrirCredenciais(antes, CAMPOS_CREDENCIAL_LISTA, decifrar)
    const escrita: Record<string, unknown> = {}
    const alterados: string[] = []
    for (const [k, v] of Object.entries(entrada.gravar)) {
      // Mesmo valor e já cifrado (o guardado difere do texto puro): nada a
      // fazer. Mesmo valor em texto puro (legado): regrava cifrado.
      const jaCifradoIgual = abertos[k as keyof typeof abertos] === v && antes[k] !== v
      if (jaCifradoIgual) continue
      escrita[k] = encrypt(v as string)
      alterados.push(k)
    }
    for (const k of entrada.apagar) {
      if (k in antes) {
        escrita[k] = FieldValue.delete()
        alterados.push(k)
      }
    }

    // Senha legada em texto puro no doc do cliente (antes da migração): sai
    // daqui — o Admin SDK pode, o fiscal pelo navegador não podia.
    const legadas = camposPreenchidos(cliente.data())
    if (alterados.length === 0 && legadas.length === 0) return { alterados }

    if (alterados.length > 0) {
      tx.set(
        ref,
        {
          ...escrita,
          tenantId: usuario.tenantId,
          clienteId,
          atualizadoEm: FieldValue.serverTimestamp(),
          atualizadoPorId: actor.id,
          atualizadoPorNome: actor.nome,
          ...(atual.exists ? {} : { criadoEm: FieldValue.serverTimestamp(), criadoPorId: actor.id, criadoPorNome: actor.nome }),
        },
        { merge: true },
      )
    }
    if (legadas.length > 0) {
      tx.update(cliente.ref, Object.fromEntries(legadas.map((k) => [k, FieldValue.delete()])))
    }
    tx.set(
      db().collection('logs_auditoria').doc(),
      montarAuditLog({
        tenantId: usuario.tenantId,
        actor,
        requisicao: requisicaoDoCallable(request),
        entidade: 'clientes_credenciais',
        entidadeId: clienteId,
        acao: atual.exists ? 'credenciais_atualizadas' : 'credenciais_criadas',
        dadosAntes: { campos: camposPreenchidos(antes) },
        dadosDepois: { campos: alterados, legadasRemovidasDoCliente: legadas },
        camposAlterados: alterados,
        origem: 'cloud_function',
      }),
    )
    return { alterados }
  })

  return { clienteId, alterados: resultado.alterados }
})

// ─── exportarCredenciaisClientes ──────────────────────────────────────────────

export const exportarCredenciaisClientes = onCall({ ...OPCOES, timeoutSeconds: 60 }, async (request) => {
  const usuario = await autorizar(request, true)
  const snap = await db()
    .collection('clientes_credenciais')
    .where('tenantId', '==', usuario.tenantId)
    .limit(LIMITE_EXPORTACAO)
    .get()

  const credenciais: Record<string, Record<string, string>> = {}
  let ilegiveis = 0
  for (const d of snap.docs) {
    const dados = d.data()
    const r = abrirCredenciais(dados, CAMPOS_CREDENCIAL_LISTA, decifrar)
    ilegiveis += r.ilegiveis.length
    credenciais[String(dados.clienteId ?? d.id)] = r.valores as Record<string, string>
  }

  await db().collection('logs_auditoria').add(
    montarAuditLog({
      tenantId: usuario.tenantId,
      actor: atorDaRequisicao(request),
      requisicao: requisicaoDoCallable(request),
      entidade: 'clientes_credenciais',
      entidadeId: null,
      acao: 'exportacao_sensivel',
      dadosAntes: null,
      dadosDepois: { relatorio: 'ficha_completa_com_senhas', clientesComSenha: snap.size, ilegiveis },
      origem: 'cloud_function',
    }),
  )

  return { credenciais, total: snap.size, truncado: snap.size >= LIMITE_EXPORTACAO }
})
