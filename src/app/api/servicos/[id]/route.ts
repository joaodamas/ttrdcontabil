import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(150).optional(),
  descricao: z.string().optional().nullable(),
  frequencia: z.enum(['mensal', 'avulso', 'anual', 'trimestral']).optional(),
  valorPadrao: z.number().positive().optional().nullable(),
  ativo: z.boolean().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const doc = await adminDb.collection('servicos').doc(id).get()
    if (!doc.exists) return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
    return NextResponse.json({ id: doc.id, ...doc.data() })
  } catch (error) {
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
    await requireAdmin()
    const { id } = await params

    const doc = await adminDb.collection('servicos').doc(id).get()
    if (!doc.exists) return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })

    const body = await req.json()
    const data = updateSchema.parse(body)

    await adminDb.collection('servicos').doc(id).update({
      ...data,
      atualizadoEm: Timestamp.now(),
    })

    const updated = await adminDb.collection('servicos').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params

    const doc = await adminDb.collection('servicos').doc(id).get()
    if (!doc.exists) return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })

    // Soft delete — set ativo: false
    await adminDb.collection('servicos').doc(id).update({
      ativo: false,
      atualizadoEm: Timestamp.now(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
