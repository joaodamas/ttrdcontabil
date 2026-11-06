/**
 * Senhas de portal do cliente — só pelos callables (desde 2026-11-06).
 *
 * O navegador não lê nem grava mais clientes_credenciais (as regras negam):
 * lerCredenciaisCliente decifra no servidor e grava log com IP a cada
 * revelação; salvarCredenciaisCliente cifra com CREDENTIAL_KEY. Chame só
 * quando podeVerCredenciais(usuario) for true (admin/fiscal).
 */
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'
import {
  CAMPOS_CREDENCIAL_LISTA,
  juntarCredenciais,
  type CampoCredencial,
  type CredenciaisCliente,
} from '@/lib/clientes-credenciais'

function callable<Req, Res>(nome: string) {
  return httpsCallable<Req, Res>(getFunctions(getFirebaseApp(), 'southamerica-east1'), nome)
}

/**
 * Revela as senhas de um cliente (todas, ou só `campos`). Cada chamada fica
 * no log de auditoria — chame no clique de "mostrar", não ao abrir a tela.
 * `cliente` (opcional) completa com senha legada em texto puro que ainda
 * esteja no doc do cliente antes da migração.
 */
export async function carregarCredenciaisCliente(
  clienteId: string,
  cliente?: Record<string, unknown> | null,
  campos?: CampoCredencial[],
): Promise<CredenciaisCliente> {
  const fn = callable<{ clienteId: string; campos?: CampoCredencial[] }, { credenciais: Record<string, string>; ilegiveis: string[] }>(
    'lerCredenciaisCliente',
  )
  const { data } = await fn(campos?.length ? { clienteId, campos } : { clienteId })
  if (data.ilegiveis?.length) {
    console.warn('[credenciais] campos que o servidor não conseguiu decifrar', data.ilegiveis)
  }
  // Campo pedido e ausente na resposta = em branco no doc novo; o legado só
  // completa o que o doc novo não tem.
  const doc: Record<string, unknown> = { ...data.credenciais }
  return juntarCredenciais(cliente, doc)
}

/** Todas as senhas do tenant, por clienteId (relatório com senhas — só admin, auditado). */
export async function listarCredenciaisClientes(): Promise<Map<string, Record<string, unknown>>> {
  const fn = callable<Record<string, never>, { credenciais: Record<string, Record<string, string>>; truncado: boolean }>(
    'exportarCredenciaisClientes',
  )
  const { data } = await fn({})
  if (data.truncado) console.warn('[credenciais] exportação limitada a 2000 clientes')
  return new Map(Object.entries(data.credenciais).map(([id, cred]) => [id, { clienteId: id, ...cred }]))
}

/**
 * Grava os campos enviados (vazio = apaga o campo). O servidor também tira do
 * doc do cliente a senha legada em texto puro que tiver sobrado. `clienteAtual`
 * fica na assinatura por compatibilidade com as telas.
 */
export async function salvarCredenciaisCliente(
  clienteId: string,
  credenciais: CredenciaisCliente,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _clienteAtual?: Record<string, unknown> | null,
) {
  const campos = Object.fromEntries(
    Object.entries(credenciais).map(([k, v]) => [k, typeof v === 'string' && v.trim() !== '' ? v : null]),
  )
  if (Object.keys(campos).length === 0) return
  const fn = callable<{ clienteId: string; credenciais: Record<string, string | null> }, { alterados: string[] }>(
    'salvarCredenciaisCliente',
  )
  await fn({ clienteId, credenciais: campos })
}

export { CAMPOS_CREDENCIAL_LISTA }
