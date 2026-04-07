export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  clienteId: z.string().min(1, 'clienteId obrigatório'),
  competenciaId: z.string().optional().nullable(),
  clienteServicoId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  titulo: z.string().optional().nullable(),
  dados: z.record(z.string(), z.unknown()).default({}),
  status: z
    .enum(['rascunho', 'validando', 'pronto_para_emitir', 'erro_validacao'])
    .default('rascunho'),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId')
    const status = searchParams.get('status')

    let query = adminDb.collection('nfse_rascunhos') as FirebaseFirestore.Query

    if (clienteId) query = query.where('clienteId', '==', clienteId)
    if (status) query = query.where('status', '==', status)

    query = query.orderBy('criadoEm', 'desc')

    const snap = await query.get()
    const rascunhos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ rascunhos })
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

    const clienteDoc = await adminDb.collection('clientes').doc(data.clienteId).get()
    if (!clienteDoc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }
    const clienteData = clienteDoc.data()!

    const now = Timestamp.now()
    const ref = await adminDb.collection('nfse_rascunhos').add({
      clienteId: data.clienteId,
      clienteNome: clienteData.razaoSocial,
      competenciaId: data.competenciaId ?? null,
      clienteServicoId: data.clienteServicoId ?? null,
      templateId: data.templateId ?? null,
      titulo: data.titulo ?? null,
      dados: data.dados,
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
