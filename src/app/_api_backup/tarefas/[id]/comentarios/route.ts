export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  texto: z.string().min(1, 'Texto do comentário é obrigatório'),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const tarefaDoc = await adminDb.collection('tarefas').doc(id).get()
    if (!tarefaDoc.exists) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const snap = await adminDb
      .collection('tarefas_comentarios')
      .where('tarefaId', '==', id)
      .orderBy('criadoEm', 'asc')
      .get()

    const comentarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ comentarios })
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
    const session = await requireAuth()
    const { id } = await params

    const tarefaDoc = await adminDb.collection('tarefas').doc(id).get()
    if (!tarefaDoc.exists) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const data = createSchema.parse(body)

    const ref = await adminDb.collection('tarefas_comentarios').add({
      tarefaId: id,
      usuarioId: session.uid,
      usuarioNome: session.nome,
      texto: data.texto,
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
