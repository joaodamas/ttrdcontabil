export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['aberta', 'em_andamento', 'concluida', 'cancelada']).optional(),
  observacoes: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  dataConclusao: z.string().optional().nullable(),
  clienteServicoId: z.string().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('competencias').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Competência não encontrada' }, { status: 404 })
    }

    const competencia = { id: doc.id, ...doc.data() }

    // Top 5 tarefas vinculadas
    const tarefasSnap = await adminDb
      .collection('tarefas')
      .where('competenciaId', '==', id)
      .orderBy('criadoEm', 'asc')
      .limit(5)
      .get()
    const tarefas = tarefasSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    // Top 5 lançamentos vinculados
    const lancamentosSnap = await adminDb
      .collection('lancamentos')
      .where('competenciaId', '==', id)
      .orderBy('dataVencimento', 'asc')
      .limit(5)
      .get()
    const lancamentos = lancamentosSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    // Top 3 NFS-e emitidas
    const nfseSnap = await adminDb
      .collection('nfse_emitidas')
      .where('competenciaId', '==', id)
      .orderBy('criadoEm', 'desc')
      .limit(3)
      .get()
    const nfse = nfseSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ competencia, tarefas, lancamentos, nfse })
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

    const doc = await adminDb.collection('competencias').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Competência não encontrada' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = { atualizadoEm: Timestamp.now() }

    if (data.status !== undefined) updateData.status = data.status
    if (data.observacoes !== undefined) updateData.observacoes = data.observacoes
    if (data.responsavelId !== undefined) updateData.responsavelId = data.responsavelId
    if (data.clienteServicoId !== undefined) updateData.clienteServicoId = data.clienteServicoId

    if (data.dataConclusao !== undefined) {
      updateData.dataConclusao = data.dataConclusao
        ? Timestamp.fromDate(new Date(data.dataConclusao))
        : null
    }

    // Auto seta dataConclusao se status == concluida e não foi informado
    if (data.status === 'concluida' && data.dataConclusao === undefined) {
      updateData.dataConclusao = Timestamp.now()
    }

    await adminDb.collection('competencias').doc(id).update(updateData)

    const updated = await adminDb.collection('competencias').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
