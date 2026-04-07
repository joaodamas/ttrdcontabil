import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  clienteId: z.string().optional().nullable(),
  competenciaId: z.string().optional().nullable(),
  clienteServicoId: z.string().optional().nullable(),
  tipo: z.enum(['receita', 'despesa']),
  descricao: z.string().min(1, 'Descrição é obrigatória').max(200),
  valor: z.number().positive('Valor deve ser positivo'),
  dataVencimento: z.string().min(1, 'Data de vencimento é obrigatória'),
  dataPagamento: z.string().optional().nullable(),
  status: z.enum(['pendente', 'pago', 'atrasado', 'cancelado', 'estornado']).default('pendente'),
  formaPagamento: z.string().max(50).optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId')
    const tipo = searchParams.get('tipo')
    const status = searchParams.get('status')

    let query = adminDb.collection('lancamentos') as FirebaseFirestore.Query

    if (clienteId) query = query.where('clienteId', '==', clienteId)
    if (tipo) query = query.where('tipo', '==', tipo)
    if (status) query = query.where('status', '==', status)

    query = query.orderBy('dataVencimento', 'asc')

    const snap = await query.get()
    const lancamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ lancamentos })
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

    const now = Timestamp.now()
    const ref = await adminDb.collection('lancamentos').add({
      clienteId: data.clienteId ?? null,
      clienteNome: clienteNome,
      competenciaId: data.competenciaId ?? null,
      clienteServicoId: data.clienteServicoId ?? null,
      tipo: data.tipo,
      descricao: data.descricao,
      valor: data.valor,
      dataVencimento: Timestamp.fromDate(new Date(data.dataVencimento)),
      dataPagamento: data.dataPagamento ? Timestamp.fromDate(new Date(data.dataPagamento)) : null,
      status: data.status,
      formaPagamento: data.formaPagamento ?? null,
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
