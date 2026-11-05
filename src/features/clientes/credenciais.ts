/**
 * Leitura e gravação das senhas de portal do cliente em
 * clientes_credenciais/{clienteId}. As regras só deixam admin e fiscal do
 * tenant; chame só quando podeVerCredenciais(usuario) for true.
 */
import { deleteField, doc, limit, updateDoc } from 'firebase/firestore'
import { getDocument, listDocuments, upsertDocument } from '@/lib/firestore-client'
import { getClientDb } from '@/lib/firebase'
import {
  CAMPOS_CREDENCIAL_LISTA,
  credenciaisLegadas,
  juntarCredenciais,
  type CredenciaisCliente,
} from '@/lib/clientes-credenciais'

export async function carregarCredenciaisCliente(
  clienteId: string,
  cliente?: Record<string, unknown> | null,
): Promise<CredenciaisCliente> {
  const docCred = await getDocument<Record<string, unknown>>('clientes_credenciais', clienteId)
  return juntarCredenciais(cliente, docCred)
}

/** Todas as credenciais do tenant, por clienteId (relatório com senhas). */
export async function listarCredenciaisClientes(): Promise<Map<string, Record<string, unknown>>> {
  const docs = await listDocuments<Record<string, unknown>>('clientes_credenciais', [limit(2000)])
  return new Map(docs.map((d) => [String(d.clienteId ?? d.id), d]))
}

/**
 * Grava os campos enviados (vazio = apaga o campo). Se o doc do cliente ainda
 * tinha senha em texto puro, tenta tirá-la de lá — as regras deixam remover,
 * mas só quem edita `clientes` (admin/operacional); o fiscal deixa para o
 * script de migração.
 */
export async function salvarCredenciaisCliente(
  clienteId: string,
  credenciais: CredenciaisCliente,
  clienteAtual?: Record<string, unknown> | null,
) {
  const campos = Object.fromEntries(
    Object.entries(credenciais).map(([k, v]) => [k, typeof v === 'string' && v.trim() !== '' ? v : null]),
  )
  if (Object.keys(campos).length > 0) {
    await upsertDocument('clientes_credenciais', clienteId, { ...campos, clienteId })
  }

  const legadas = Object.keys(credenciaisLegadas(clienteAtual))
  if (legadas.length > 0) {
    await updateDoc(
      doc(getClientDb(), 'clientes', clienteId),
      Object.fromEntries(legadas.map((k) => [k, deleteField()])),
    ).catch((err) => console.warn('[credenciais] senha legada fica até a migração', err))
  }
}

export { CAMPOS_CREDENCIAL_LISTA }
