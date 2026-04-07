export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  descricao: z.string().optional().nullable(),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']).optional(),
  status: z.enum(['pendente', 'em_andamento', 'concluida', 'cancelada']).optional(),
  responsavelId: z.string().optional().nullable(),
  dataPrazo: z.string().optional().nullable(),
  dataConclusao: z.string().optional().nullable(),
  competenciaId: z.string().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('tarefas').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const tarefa = { id: doc.id, ...doc.data() }

    // Comentários ordenados por criadoEm
    const comentariosSnap = await adminDb
      .collection('tarefas_comentarios')
      .where('tarefaId', '==', id)
      .orderBy('criadoEm', 'asc')
      .get()
    const comentarios = comentariosSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ tarefa, comentarios })
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
    const data = updateSchema.parse(body)

    const doc = await adminDb.collection('tarefas').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const existing = doc.data()!
    const updateData: Record<string, unknown> = { atualizadoEm: Timestamp.now() }

    if (data.titulo !== undefined) updateData.titulo = data.titulo
    if (data.descricao !== undefined) updateData.descricao = data.descricao
    if (data.prioridade !== undefined) updateData.prioridade = data.prioridade
    if (data.status !== undefined) updateData.status = data.status
    if (data.responsavelId !== undefined) updateData.responsavelId = data.responsavelId
    if (data.competenciaId !== undefined) updateData.competenciaId = data.competenciaId

    if (data.dataPrazo !== undefined) {
      updateData.dataPrazo = data.dataPrazo ? Timestamp.fromDate(new Date(data.dataPrazo)) : null
    }
    if (data.dataConclusao !== undefined) {
      updateData.dataConclusao = data.dataConclusao ? Timestamp.fromDate(new Date(data.dataConclusao)) : null
    }

    // Auto-set dataConclusao quando status == concluida
    if (data.status === 'concluida' && !existing.dataConclusao && data.dataConclusao === undefined) {
      updateData.dataConclusao = Timestamp.now()
    }

    await adminDb.collection('tarefas').doc(id).update(updateData)

    const updated = await adminDb.collection('tarefas').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
