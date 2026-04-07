export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  clienteId: z.string().min(1, 'clienteId obrigatório'),
  clienteServicoId: z.string().optional().nullable(),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  status: z.enum(['aberta', 'em_andamento', 'concluida', 'cancelada']).default('aberta'),
  observacoes: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  dataConclusao: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId')
    const mes = searchParams.get('mes')
    const ano = searchParams.get('ano')
    const status = searchParams.get('status')
    const responsavelId = searchParams.get('responsavelId')

    let query = adminDb.collection('competencias') as FirebaseFirestore.Query

    if (clienteId) query = query.where('clienteId', '==', clienteId)
    if (mes) query = query.where('mes', '==', parseInt(mes))
    if (ano) query = query.where('ano', '==', parseInt(ano))
    if (status) query = query.where('status', '==', status)
    if (responsavelId) query = query.where('responsavelId', '==', responsavelId)

    query = query.orderBy('ano', 'desc').orderBy('mes', 'desc')

    const snap = await query.get()
    const competencias = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ competencias })
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

    // Verifica unicidade: clienteId + clienteServicoId + mes + ano
    let unicidadeQuery = adminDb
      .collection('competencias')
      .where('clienteId', '==', data.clienteId)
      .where('mes', '==', data.mes)
      .where('ano', '==', data.ano) as FirebaseFirestore.Query

    if (data.clienteServicoId) {
      unicidadeQuery = unicidadeQuery.where('clienteServicoId', '==', data.clienteServicoId)
    }

    const existente = await unicidadeQuery.limit(1).get()
    if (!existente.empty) {
      return NextResponse.json({ error: 'Já existe competência para este cliente/serviço/período' }, { status: 409 })
    }

    // Denormaliza responsável
    let responsavelNome: string | null = null
    if (data.responsavelId) {
      const respDoc = await adminDb.collection('usuarios').doc(data.responsavelId).get()
      if (respDoc.exists) responsavelNome = respDoc.data()!.nome ?? null
    }

    // Denormaliza serviço
    let servicoNome: string | null = null
    if (data.clienteServicoId) {
      const csDoc = await adminDb.collection('clientes_servicos').doc(data.clienteServicoId).get()
      if (csDoc.exists) servicoNome = csDoc.data()!.servicoNome ?? null
    }

    const now = Timestamp.now()
    const ref = await adminDb.collection('competencias').add({
      clienteId: data.clienteId,
      clienteNome: clienteData.razaoSocial,
      clienteServicoId: data.clienteServicoId ?? null,
      servicoNome: servicoNome,
      mes: data.mes,
      ano: data.ano,
      status: data.status,
      observacoes: data.observacoes ?? null,
      responsavelId: data.responsavelId ?? null,
      responsavelNome: responsavelNome,
      dataConclusao: data.dataConclusao ? Timestamp.fromDate(new Date(data.dataConclusao)) : null,
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
