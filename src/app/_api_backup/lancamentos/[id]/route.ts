export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  descricao: z.string().min(1).max(200).optional(),
  valor: z.number().positive().optional(),
  dataVencimento: z.string().optional(),
  status: z.enum(['pendente', 'pago', 'atrasado', 'cancelado', 'estornado']).optional(),
  formaPagamento: z.string().max(50).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  baixar: z
    .object({
      dataPagamento: z.string().min(1, 'Data de pagamento é obrigatória'),
      formaPagamento: z.string().min(1, 'Forma de pagamento é obrigatória').max(50),
    })
    .optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('lancamentos').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 })
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

    const body = await req.json()
    const data = updateSchema.parse(body)

    const doc = await adminDb.collection('lancamentos').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = { atualizadoEm: Timestamp.now() }

    if (data.baixar) {
      // Baixar: registra pagamento
      updateData.dataPagamento = Timestamp.fromDate(new Date(data.baixar.dataPagamento))
      updateData.formaPagamento = data.baixar.formaPagamento
      updateData.status = 'pago'
    } else {
      if (data.descricao !== undefined) updateData.descricao = data.descricao
      if (data.valor !== undefined) updateData.valor = data.valor
      if (data.dataVencimento !== undefined) {
        updateData.dataVencimento = Timestamp.fromDate(new Date(data.dataVencimento))
      }
      if (data.status !== undefined) updateData.status = data.status
      if (data.formaPagamento !== undefined) updateData.formaPagamento = data.formaPagamento
      if (data.observacoes !== undefined) updateData.observacoes = data.observacoes
    }

    await adminDb.collection('lancamentos').doc(id).update(updateData)

    const updated = await adminDb.collection('lancamentos').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
