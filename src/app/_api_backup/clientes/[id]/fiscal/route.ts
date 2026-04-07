export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const fiscalSchema = z.object({
  municipioEmissor: z.string().min(1, 'Município emissor é obrigatório'),
  uf: z.string().length(2, 'UF deve ter 2 caracteres'),
  codigoMunicipioIbge: z.string().optional().nullable(),
  inscricaoMunicipal: z.string().optional().nullable(),
  regimeTributario: z
    .enum(['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'isento'])
    .optional()
    .nullable(),
  optanteSimples: z.boolean().default(false),
  incentivadorCultural: z.boolean().default(false),
  naturezaOperacaoPadrao: z.string().optional().nullable(),
  codigoServicoPadrao: z.string().optional().nullable(),
  descricaoServicoPadrao: z.string().optional().nullable(),
  aliquotaPadrao: z.number().min(0).max(100).optional().nullable(),
  itemListaServico: z.string().optional().nullable(),
  cnae: z.string().optional().nullable(),
  ambienteEmissao: z.enum(['producao', 'homologacao']).default('homologacao'),
  tipoIntegracaoNfse: z
    .enum(['nacional', 'prefeitura', 'provedor', 'manual_assistido'])
    .default('manual_assistido'),
  ativo: z.boolean().default(true),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const snap = await adminDb
      .collection('clientes_fiscal')
      .where('clienteId', '==', id)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json(null)
    }

    const doc = snap.docs[0]
    return NextResponse.json({ id: doc.id, ...doc.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const clienteDoc = await adminDb.collection('clientes').doc(id).get()
    if (!clienteDoc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const data = fiscalSchema.parse(body)

    const now = Timestamp.now()

    // Verifica se já existe — upsert
    const existing = await adminDb
      .collection('clientes_fiscal')
      .where('clienteId', '==', id)
      .limit(1)
      .get()

    if (!existing.empty) {
      const docId = existing.docs[0].id
      await adminDb.collection('clientes_fiscal').doc(docId).update({
        ...data,
        atualizadoEm: now,
      })
      const updated = await adminDb.collection('clientes_fiscal').doc(docId).get()
      return NextResponse.json({ id: updated.id, ...updated.data() })
    }

    const ref = await adminDb.collection('clientes_fiscal').add({
      clienteId: id,
      ...data,
      criadoEm: now,
      atualizadoEm: now,
    })

    const doc = await ref.get()
    return NextResponse.json({ id: doc.id, ...doc.data() }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const body = await req.json()
    const data = fiscalSchema.partial().parse(body)

    const snap = await adminDb
      .collection('clientes_fiscal')
      .where('clienteId', '==', id)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Dados fiscais não encontrados' }, { status: 404 })
    }

    const docId = snap.docs[0].id
    const updateData: Record<string, unknown> = { ...data, atualizadoEm: Timestamp.now() }

    await adminDb.collection('clientes_fiscal').doc(docId).update(updateData)
    const updated = await adminDb.collection('clientes_fiscal').doc(docId).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
