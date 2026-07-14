import { where, limit, type QueryConstraint } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { listDocuments, createDocument, updateDocument, softDeleteDocument } from '@/lib/firestore-client'
import { getFirebaseApp } from '@/lib/firebase'
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

// ── Emissão de NF-e ──────────────────────────────────────────────────────────
export type ImpostoInput = {
  cst?: string; csosn?: string; origem?: string
  baseCalculo?: number; aliquota?: number; valor?: number
  stBaseRetencao?: number; stValorRetido?: number
}
export type ItemNfeInput = {
  codigo: string; descricao: string; ncm: string; cfop: string
  unidade: string; quantidade: number; valorUnitario: number
  icms: ImpostoInput; pis?: ImpostoInput; cofins?: ImpostoInput; ipi?: ImpostoInput
}
export type EmitirNfeInput = {
  clienteId: string
  naturezaOperacao: string
  destino?: 'internal' | 'interstate'
  tomador: { cpfCnpj: string; razaoSocial: string; email?: string }
  itens: ItemNfeInput[]
}
export type EmitirNfeResult = {
  sucesso: boolean; id: string; numeroNfse?: string | null; erro?: string; codigoErro?: string | null
}

const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v))
const str = (v: unknown) => (v == null ? undefined : String(v))

/** Converte um produto do catálogo (ficha fiscal plana) no item da NF-e. */
export function produtoParaItem(p: ProdutoRecord, quantidade: number, valorUnitario: number): ItemNfeInput {
  return {
    codigo: String(p.codigo ?? ''),
    descricao: String(p.descricao ?? ''),
    ncm: String(p.ncm ?? ''),
    cfop: String(p.cfop ?? ''),
    unidade: String(p.unidade ?? 'UN'),
    quantidade,
    valorUnitario,
    icms: {
      cst: str(p.icmsCst), csosn: str(p.icmsCsosn), origem: str(p.origem) ?? '0',
      aliquota: num(p.icmsAliquota),
      stBaseRetencao: num(p.icmsStBaseRetencao), stValorRetido: num(p.icmsStValorRetido),
    },
    pis: p.pisCst ? { cst: str(p.pisCst), aliquota: num(p.pisAliquota) } : undefined,
    cofins: p.cofinsCst ? { cst: str(p.cofinsCst), aliquota: num(p.cofinsAliquota) } : undefined,
    ipi: p.ipiCst ? { cst: str(p.ipiCst), aliquota: num(p.ipiAliquota) } : undefined,
  }
}

export async function emitirNfeProduto(input: EmitirNfeInput): Promise<EmitirNfeResult> {
  const fn = httpsCallable<EmitirNfeInput, EmitirNfeResult>(
    getFunctions(getFirebaseApp(), 'southamerica-east1'),
    'emitirNfeProduto',
  )
  const { data } = await fn(input)
  return data
}
