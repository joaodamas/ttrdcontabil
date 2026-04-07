import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  tipoPessoa: z.enum(['pf', 'pj']).optional(),
  razaoSocial: z.string().min(2).optional(),
  nomeFantasia: z.string().optional().nullable(),
  cpfCnpj: z.string().optional(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefone: z.string().optional().nullable(),
  celular: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  regimeTributario: z
    .enum(['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'isento'])
    .optional()
    .nullable(),
  responsavelNome: z.string().optional().nullable(),
  responsavelEmail: z.string().optional().nullable(),
  responsavelTelefone: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  status: z.enum(['ativo', 'inativo', 'suspenso']).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const doc = await adminDb.collection('clientes').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const cliente = { id: doc.id, ...doc.data() }

    // Dados fiscais
    const fiscalSnap = await adminDb
      .collection('clientes_fiscal')
      .where('clienteId', '==', id)
      .limit(1)
      .get()
    const fiscal = fiscalSnap.empty ? null : { id: fiscalSnap.docs[0].id, ...fiscalSnap.docs[0].data() }

    // Contagens
    const [competenciasSnap, tarefasSnap, lancamentosSnap] = await Promise.all([
      adminDb.collection('competencias').where('clienteId', '==', id).count().get(),
      adminDb.collection('tarefas').where('clienteId', '==', id).count().get(),
      adminDb.collection('lancamentos').where('clienteId', '==', id).count().get(),
    ])

    return NextResponse.json({
      ...cliente,
      fiscal,
      _count: {
        competencias: competenciasSnap.data().count,
        tarefas: tarefasSnap.data().count,
        lancamentos: lancamentosSnap.data().count,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params
    const body = await request.json()
    const data = updateSchema.parse(body)

    const doc = await adminDb.collection('clientes').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    // Remove undefined keys
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) updateData[k] = v
    }
    updateData.atualizadoEm = Timestamp.now()

    await adminDb.collection('clientes').doc(id).update(updateData)

    const updated = await adminDb.collection('clientes').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
