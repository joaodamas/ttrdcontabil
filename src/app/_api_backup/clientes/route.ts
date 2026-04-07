export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const clienteSchema = z.object({
  tipoPessoa: z.enum(['pf', 'pj']).default('pj'),
  razaoSocial: z.string().min(2, 'Nome obrigatório'),
  nomeFantasia: z.string().optional(),
  cpfCnpj: z.string().min(11, 'CPF/CNPJ inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  regimeTributario: z
    .enum(['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'isento'])
    .optional()
    .nullable(),
  responsavelNome: z.string().optional(),
  responsavelEmail: z.string().optional(),
  responsavelTelefone: z.string().optional(),
  observacoes: z.string().optional(),
  status: z.enum(['ativo', 'inativo', 'suspenso']).default('ativo'),
})

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    void session

    const { searchParams } = new URL(request.url)
    const busca = searchParams.get('busca') ?? ''
    const status = searchParams.get('status') ?? ''

    let query = adminDb.collection('clientes').orderBy('razaoSocial') as FirebaseFirestore.Query

    if (status) {
      query = query.where('status', '==', status)
    }

    const snap = await query.get()
    let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>

    // Filtro de busca em memória (Firestore não suporta contains nativo)
    if (busca) {
      const buscaLower = busca.toLowerCase()
      docs = docs.filter(
        (d) =>
          String(d.razaoSocial ?? '').toLowerCase().includes(buscaLower) ||
          String(d.nomeFantasia ?? '').toLowerCase().includes(buscaLower) ||
          String(d.cpfCnpj ?? '').replace(/\D/g, '').includes(busca.replace(/\D/g, ''))
      )
    }

    return NextResponse.json({ clientes: docs, total: docs.length })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const data = clienteSchema.parse(body)

    // Verifica CPF/CNPJ duplicado
    const cpfCnpjLimpo = data.cpfCnpj.replace(/\D/g, '')
    const existente = await adminDb
      .collection('clientes')
      .where('cpfCnpj', '==', cpfCnpjLimpo)
      .limit(1)
      .get()

    if (!existente.empty) {
      return NextResponse.json({ error: 'CPF/CNPJ já cadastrado' }, { status: 409 })
    }

    const now = Timestamp.now()
    const ref = await adminDb.collection('clientes').add({
      ...data,
      cpfCnpj: cpfCnpjLimpo,
      email: data.email || null,
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
