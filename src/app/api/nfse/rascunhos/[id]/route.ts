import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  titulo: z.string().optional().nullable(),
  dados: z.record(z.string(), z.unknown()).optional(),
  status: z
    .enum(['rascunho', 'validando', 'pronto_para_emitir', 'erro_validacao'])
    .optional(),
  templateId: z.string().optional().nullable(),
  competenciaId: z.string().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('nfse_rascunhos').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ id: doc.id, ...doc.data() })
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

    const doc = await adminDb.collection('nfse_rascunhos').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = { atualizadoEm: Timestamp.now() }
    if (data.titulo !== undefined) updateData.titulo = data.titulo
    if (data.dados !== undefined) updateData.dados = data.dados
    if (data.status !== undefined) updateData.status = data.status
    if (data.templateId !== undefined) updateData.templateId = data.templateId
    if (data.competenciaId !== undefined) updateData.competenciaId = data.competenciaId

    await adminDb.collection('nfse_rascunhos').doc(id).update(updateData)

    const updated = await adminDb.collection('nfse_rascunhos').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
