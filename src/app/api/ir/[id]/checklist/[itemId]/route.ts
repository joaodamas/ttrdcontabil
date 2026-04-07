import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  recebido: z.boolean().optional(),
  dataRecebimento: z.string().optional().nullable(),
  descricao: z.string().min(1).max(200).optional(),
  observacao: z.string().optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await requireAuth()
    const { id, itemId } = await params

    const body = await req.json()
    const data = updateSchema.parse(body)

    const itemDoc = await adminDb.collection('ir_checklist').doc(itemId).get()
    if (!itemDoc.exists || itemDoc.data()!.declaracaoId !== id) {
      return NextResponse.json({ error: 'Item do checklist não encontrado' }, { status: 404 })
    }

    const existing = itemDoc.data()!
    const updateData: Record<string, unknown> = {}

    if (data.descricao !== undefined) updateData.descricao = data.descricao
    if (data.observacao !== undefined) updateData.observacao = data.observacao

    if (data.recebido !== undefined) {
      updateData.recebido = data.recebido
      // Auto-set dataRecebimento quando marcado como recebido
      if (data.recebido && !existing.dataRecebimento && data.dataRecebimento === undefined) {
        updateData.dataRecebimento = Timestamp.now()
      }
    }

    if (data.dataRecebimento !== undefined) {
      updateData.dataRecebimento = data.dataRecebimento
        ? Timestamp.fromDate(new Date(data.dataRecebimento))
        : null
    }

    await adminDb.collection('ir_checklist').doc(itemId).update(updateData)

    const updated = await adminDb.collection('ir_checklist').doc(itemId).get()
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
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await requireAuth()
    const { id, itemId } = await params

    const itemDoc = await adminDb.collection('ir_checklist').doc(itemId).get()
    if (!itemDoc.exists || itemDoc.data()!.declaracaoId !== id) {
      return NextResponse.json({ error: 'Item do checklist não encontrado' }, { status: 404 })
    }

    await adminDb.collection('ir_checklist').doc(itemId).delete()

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
