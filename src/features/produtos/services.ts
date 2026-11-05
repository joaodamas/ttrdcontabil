import { where, limit, type QueryConstraint } from 'firebase/firestore'
import { listDocuments, createDocument, updateDocument, softDeleteDocument } from '@/lib/firestore-client'
import type { ProdutoRecord } from './types'

export async function fetchProdutos(params: { clienteId?: string; busca?: string } = {}): Promise<ProdutoRecord[]> {
  const constraints: QueryConstraint[] = []
  if (params.clienteId) constraints.push(where('clienteId', '==', params.clienteId))
  constraints.push(limit(500))

  const data = await listDocuments('produtos', constraints)
  let produtos = (data as ProdutoRecord[]).filter((p) => !p.deletedAt)

  const busca = params.busca?.trim().toLowerCase()
  if (busca) {
    produtos = produtos.filter((p) =>
      String(p.descricao ?? '').toLowerCase().includes(busca) ||
      String(p.codigo ?? '').toLowerCase().includes(busca) ||
      String(p.ncm ?? '').includes(busca),
    )
  }

  return produtos.sort((a, b) =>
    String(a.descricao ?? a.codigo ?? a.id).localeCompare(String(b.descricao ?? b.codigo ?? b.id), 'pt-BR'),
  )
}

export async function createProduto(data: Partial<ProdutoRecord>) {
  return createDocument('produtos', data as Record<string, unknown>)
}

export async function updateProduto(id: string, data: Partial<ProdutoRecord>) {
  return updateDocument('produtos', id, data as Record<string, unknown>)
}

export async function deleteProduto(id: string) {
  return softDeleteDocument('produtos', id)
}
