export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  clienteId: z.string().optional().nullable(),
  competenciaId: z.string().optional().nullable(),
  titulo: z.string().min(1, 'Título é obrigatório').max(200),
  descricao: z.string().optional().nullable(),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']).default('normal'),
  status: z.enum(['pendente', 'em_andamento', 'concluida', 'cancelada']).default('pendente'),
  responsavelId: z.string().optional().nullable(),
  dataPrazo: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId')
    const competenciaId = searchParams.get('competenciaId')
    const status = searchParams.get('status')
    const responsavelId = searchParams.get('responsavelId')
    const prioridade = searchParams.get('prioridade')

    let query = adminDb.collection('tarefas') as FirebaseFirestore.Query

    if (clienteId) query = query.where('clienteId', '==', clienteId)
    if (competenciaId) query = query.where('competenciaId', '==', competenciaId)
    if (status) query = query.where('status', '==', status)
    if (responsavelId) query = query.where('responsavelId', '==', responsavelId)
    if (prioridade) query = query.where('prioridade', '==', prioridade)

    query = query.orderBy('dataPrazo', 'asc')

    const snap = await query.get()
    const tarefas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ tarefas })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()

    const body = await req.json()
    const data = createSchema.parse(body)

    // Denormaliza cliente
    let clienteNome: string | null = null
    if (data.clienteId) {
      const cDoc = await adminDb.collection('clientes').doc(data.clienteId).get()
      if (cDoc.exists) clienteNome = cDoc.data()!.razaoSocial ?? null
    }

    // Denormaliza responsável
    let responsavelNome: string | null = null
    if (data.responsavelId) {
      const rDoc = await adminDb.collection('usuarios').doc(data.responsavelId).get()
      if (rDoc.exists) responsavelNome = rDoc.data()!.nome ?? null
    }

    const now = Timestamp.now()
    const ref = await adminDb.collection('tarefas').add({
      clienteId: data.clienteId ?? null,
      clienteNome: clienteNome,
      competenciaId: data.competenciaId ?? null,
      titulo: data.titulo,
      descricao: data.descricao ?? null,
      prioridade: data.prioridade,
      status: data.status,
      responsavelId: data.responsavelId ?? null,
      responsavelNome: responsavelNome,
      dataPrazo: data.dataPrazo ? Timestamp.fromDate(new Date(data.dataPrazo)) : null,
      dataConclusao: null,
      criadoPorId: session.uid,
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
