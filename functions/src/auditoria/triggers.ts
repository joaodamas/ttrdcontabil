/**
 * Auditoria de CRUD das coleções sensíveis, gravada pelo SERVIDOR.
 *
 * Antes o próprio navegador escrevia o log depois de salvar (src/lib/firestore-client.ts):
 * dava para salvar sem logar (chamando o SDK direto), logar o que quisesse e,
 * com a regra antiga, até escolher o criadoEm. Agora um trigger por coleção
 * grava antes/depois do que de fato mudou no banco, venha de onde vier (tela,
 * SDK direto, script, console), com o uid do contexto de autenticação do
 * evento — que o navegador não controla.
 *
 * Nome/e-mail do ator saem da conta no Firebase Auth (não de
 * usuarios/{uid}.nome, que o usuário edita). Id do log = id do evento: se o
 * Eventarc reentregar, o create() falha e não duplica.
 */
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { onDocumentWrittenWithAuthContext, type FirestoreAuthEvent } from 'firebase-functions/v2/firestore'
import type { Change, DocumentSnapshot } from 'firebase-functions/v2/firestore'

import { montarAuditLog, SYSTEM_ACTOR, type AuditActor } from '../audit'
import { camposPreenchidos } from '../clientes/credenciais-campos'
import { DEFAULT_TENANT_ID } from '../tenant'
import {
  atorDoEvento,
  classificarEscrita,
  dadosParaLog,
  type ColecaoAuditada,
} from './regras'

const db = () => getFirestore()
const REGION = 'southamerica-east1'

const cacheAtores = new Map<string, { ator: AuditActor; em: number }>()
const CACHE_ATOR_MS = 10 * 60_000

async function resolverAtor(authType: string | undefined, authId: string | undefined): Promise<AuditActor> {
  const quem = atorDoEvento(authType, authId)
  if (quem.tipo === 'sistema') {
    return { ...SYSTEM_ACTOR, id: quem.id, nome: `Sistema (${quem.authType})` }
  }
  const emCache = cacheAtores.get(quem.id)
  if (emCache && Date.now() - emCache.em < CACHE_ATOR_MS) return emCache.ator
  let ator: AuditActor = { id: quem.id, nome: quem.id, email: null }
  try {
    const conta = await getAuth().getUser(quem.id)
    ator = { id: quem.id, nome: conta.displayName || conta.email || quem.id, email: conta.email ?? null }
  } catch {
    // Conta excluída depois da escrita (fica o uid) ou authId que não é uid.
    if (authType !== 'app_user') ator = { ...SYSTEM_ACTOR, id: quem.id, nome: `Sistema (${authType ?? 'unknown'})` }
  }
  cacheAtores.set(quem.id, { ator, em: Date.now() })
  return ator
}

type EventoEscrita = FirestoreAuthEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>

export async function auditarEscrita(colecao: ColecaoAuditada, docId: string, event: EventoEscrita) {
  const antes = event.data?.before?.exists ? event.data.before.data() ?? null : null
  const depois = event.data?.after?.exists ? event.data.after.data() ?? null : null
  const classe = classificarEscrita(antes, depois)
  if (!classe) return

  const actor = await resolverAtor(event.authType, event.authId)
  const tenantRaw = (depois?.tenantId ?? antes?.tenantId) as unknown
  const tenantId = typeof tenantRaw === 'string' && tenantRaw ? tenantRaw : DEFAULT_TENANT_ID

  const log = montarAuditLog({
    tenantId,
    actor,
    entidade: colecao,
    entidadeId: docId,
    acao: classe.acao,
    dadosAntes: dadosParaLog(colecao, antes, camposPreenchidos) as Record<string, unknown> | null,
    dadosDepois: dadosParaLog(colecao, depois, camposPreenchidos) as Record<string, unknown> | null,
    camposAlterados: classe.campos,
    origem: 'trigger',
  })

  const id = `trg_${String(event.id).replace(/[^A-Za-z0-9_-]/g, '_')}`
  try {
    await db().collection('logs_auditoria').doc(id).create({ ...log, authType: event.authType ?? null })
  } catch (err) {
    if ((err as { code?: number }).code === 6) return // ALREADY_EXISTS: reentrega do mesmo evento
    throw err
  }
}

function trigger(colecao: ColecaoAuditada) {
  return onDocumentWrittenWithAuthContext(
    { document: `${colecao}/{docId}`, region: REGION },
    (event) => auditarEscrita(colecao, event.params.docId, event as EventoEscrita),
  )
}

export const auditarClientes = trigger('clientes')
export const auditarClientesFiscal = trigger('clientes_fiscal')
export const auditarClientesCredenciais = trigger('clientes_credenciais')
export const auditarLancamentos = trigger('lancamentos')
export const auditarUsuarios = trigger('usuarios')
