export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  clienteId: z.string().min(1, 'clienteId obrigatório'),
  anoBase: z.number().int().min(2000).max(2100),
  status: z
    .enum(['pendente', 'em_andamento', 'entregue', 'retificado', 'cancelado'])
    .default('pendente'),
  responsavelId: z.string().optional().nullable(),
  dataEntrega: z.string().optional().nullable(),
  numeroRecibo: z.string().max(50).optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId')
    const anoBase = searchParams.get('anoBase')
    const status = searchParams.get('status')

    let query = adminDb.collection('ir_declaracoes') as FirebaseFirestore.Query

    if (clienteId) query = query.where('clienteId', '==', clienteId)
    if (anoBase) query = query.where('anoBase', '==', parseInt(anoBase))
    if (status) query = query.where('status', '==', status)

    query = query.orderBy('anoBase', 'desc').orderBy('criadoEm', 'desc')

    const snap = await query.get()
    const declaracoes = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ declaracoes })
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

    // Verifica cliente
    const clienteDoc = await adminDb.collection('clientes').doc(data.clienteId).get()
    if (!clienteDoc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }
    const clienteData = clienteDoc.data()!

    // Denormaliza responsável
    let responsavelNome: string | null = null
    if (data.responsavelId) {
      const rDoc = await adminDb.collection('usuarios').doc(data.responsavelId).get()
      if (rDoc.exists) responsavelNome = rDoc.data()!.nome ?? null
    }

    const now = Timestamp.now()
    const ref = await adminDb.collection('ir_declaracoes').add({
      clienteId: data.clienteId,
      clienteNome: clienteData.razaoSocial,
      anoBase: data.anoBase,
      status: data.status,
      responsavelId: data.responsavelId ?? null,
      responsavelNome: responsavelNome,
      dataEntrega: data.dataEntrega ? Timestamp.fromDate(new Date(data.dataEntrega)) : null,
      numeroRecibo: data.numeroRecibo ?? null,
      observacoes: data.observacoes ?? null,
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
