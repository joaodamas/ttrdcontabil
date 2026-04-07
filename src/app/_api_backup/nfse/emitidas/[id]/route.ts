export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  numeroNfse: z.string().optional().nullable(),
  serie: z.string().optional().nullable(),
  codigoVerificacao: z.string().optional().nullable(),
  status: z
    .enum(['emitida', 'pendente_processamento', 'rejeitada', 'cancelada', 'erro_integracao'])
    .optional(),
  dataEmissao: z.string().optional().nullable(),
  xmlUrl: z.string().url().optional().nullable(),
  pdfUrl: z.string().url().optional().nullable(),
  linkConsulta: z.string().url().optional().nullable(),
  protocolo: z.string().optional().nullable(),
  chaveExterna: z.string().optional().nullable(),
  respostaIntegracao: z.record(z.string(), z.unknown()).optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('nfse_emitidas').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'NFS-e não encontrada' }, { status: 404 })
    }

    const nota = { id: doc.id, ...doc.data() }

    // Eventos da nota
    const eventosSnap = await adminDb
      .collection('nfse_eventos')
      .where('nfseId', '==', id)
      .orderBy('criadoEm', 'desc')
      .get()
    const eventos = eventosSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ nota, eventos })
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
    const session = await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('nfse_emitidas').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'NFS-e não encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const data = updateSchema.parse(body)

    const now = Timestamp.now()
    const updateData: Record<string, unknown> = { atualizadoEm: now }

    if (data.numeroNfse !== undefined) updateData.numeroNfse = data.numeroNfse
    if (data.serie !== undefined) updateData.serie = data.serie
    if (data.codigoVerificacao !== undefined) updateData.codigoVerificacao = data.codigoVerificacao
    if (data.status !== undefined) updateData.status = data.status
    if (data.xmlUrl !== undefined) updateData.xmlUrl = data.xmlUrl
    if (data.pdfUrl !== undefined) updateData.pdfUrl = data.pdfUrl
    if (data.linkConsulta !== undefined) updateData.linkConsulta = data.linkConsulta
    if (data.protocolo !== undefined) updateData.protocolo = data.protocolo
    if (data.chaveExterna !== undefined) updateData.chaveExterna = data.chaveExterna
    if (data.respostaIntegracao !== undefined) updateData.respostaIntegracao = data.respostaIntegracao

    if (data.dataEmissao !== undefined) {
      updateData.dataEmissao = data.dataEmissao
        ? Timestamp.fromDate(new Date(data.dataEmissao))
        : null
    }

    await adminDb.collection('nfse_emitidas').doc(id).update(updateData)

    // Registra evento de atualização
    await adminDb.collection('nfse_eventos').add({
      nfseId: id,
      tipoEvento: 'emissao',
      status: data.status ?? doc.data()!.status,
      mensagem: 'Atualização assistida',
      usuarioId: session.uid,
      criadoEm: now,
    })

    const updated = await adminDb.collection('nfse_emitidas').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
