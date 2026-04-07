import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  descricao: z.string().min(1, 'Descrição é obrigatória').max(200),
  recebido: z.boolean().default(false),
  dataRecebimento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const decDoc = await adminDb.collection('ir_declaracoes').doc(id).get()
    if (!decDoc.exists) {
      return NextResponse.json({ error: 'Declaração IR não encontrada' }, { status: 404 })
    }

    const snap = await adminDb
      .collection('ir_checklist')
      .where('declaracaoId', '==', id)
      .orderBy('criadoEm', 'asc')
      .get()

    const checklist = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ checklist })
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

    const decDoc = await adminDb.collection('ir_declaracoes').doc(id).get()
    if (!decDoc.exists) {
      return NextResponse.json({ error: 'Declaração IR não encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const data = createSchema.parse(body)

    const ref = await adminDb.collection('ir_checklist').add({
      declaracaoId: id,
      descricao: data.descricao,
      recebido: data.recebido,
      dataRecebimento: data.dataRecebimento
        ? Timestamp.fromDate(new Date(data.dataRecebimento))
        : null,
      observacao: data.observacao ?? null,
      criadoEm: Timestamp.now(),
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
