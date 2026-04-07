export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const statusOb = z.enum(['pendente', 'enviado', 'parcial', 'ok', 'sm', 'guia', 'na'])

const patchSchema = z.object({
  dasStatus:    statusOb.optional(),
  esocialStatus: statusOb.optional(),
  reinfStatus:  statusOb.optional(),
  fgtsStatus:   statusOb.optional(),
  responsavel:  z.string().optional(),
  portalUrl:    z.string().optional().nullable(),
  formaEntrega: z.enum(['guia', 'sm', 'programa', 'email', 'manual']).optional().nullable(),
  observacoes:  z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('fechamentos').doc(id).get()
    if (!doc.exists) return NextResponse.json({ error: 'Fechamento não encontrado' }, { status: 404 })

    const body = await req.json()
    const data = patchSchema.parse(body)

    const update: Record<string, unknown> = { atualizadoEm: Timestamp.now() }
    if (data.dasStatus !== undefined) update.dasStatus = data.dasStatus
    if (data.esocialStatus !== undefined) update.esocialStatus = data.esocialStatus
    if (data.reinfStatus !== undefined) update.reinfStatus = data.reinfStatus
    if (data.fgtsStatus !== undefined) update.fgtsStatus = data.fgtsStatus
    if (data.responsavel !== undefined) update.responsavel = data.responsavel
    if (data.portalUrl !== undefined) update.portalUrl = data.portalUrl
    if (data.formaEntrega !== undefined) update.formaEntrega = data.formaEntrega
    if (data.observacoes !== undefined) update.observacoes = data.observacoes

    await adminDb.collection('fechamentos').doc(id).update(update)
    const updated = await adminDb.collection('fechamentos').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
