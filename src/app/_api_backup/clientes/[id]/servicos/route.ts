export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  servicoId: z.string().min(1, 'servicoId obrigatório'),
  valor: z.number().positive('Valor deve ser positivo'),
  diaVencimento: z.number().int().min(1).max(31).optional().nullable(),
  dataInicio: z.string().min(1, 'Data de início é obrigatória'),
  dataFim: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  status: z.enum(['ativo', 'inativo', 'suspenso']).default('ativo'),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const clienteDoc = await adminDb.collection('clientes').doc(id).get()
    if (!clienteDoc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const snap = await adminDb
      .collection('clientes_servicos')
      .where('clienteId', '==', id)
      .orderBy('dataInicio', 'desc')
      .get()

    const servicos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ servicos })
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

    const clienteDoc = await adminDb.collection('clientes').doc(id).get()
    if (!clienteDoc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }
    const clienteData = clienteDoc.data()!

    const body = await req.json()
    const data = createSchema.parse(body)

    // Verifica se o serviço existe
    const servicoDoc = await adminDb.collection('servicos').doc(data.servicoId).get()
    if (!servicoDoc.exists) {
      return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
    }
    const servicoData = servicoDoc.data()!

    const now = Timestamp.now()
    const ref = await adminDb.collection('clientes_servicos').add({
      clienteId: id,
      clienteNome: clienteData.razaoSocial,
      servicoId: data.servicoId,
      servicoNome: servicoData.nome,
      valor: data.valor,
      diaVencimento: data.diaVencimento ?? null,
      dataInicio: Timestamp.fromDate(new Date(data.dataInicio)),
      dataFim: data.dataFim ? Timestamp.fromDate(new Date(data.dataFim)) : null,
      observacoes: data.observacoes ?? null,
      status: data.status,
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
