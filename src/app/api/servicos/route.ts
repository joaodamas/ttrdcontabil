import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(150),
  descricao: z.string().optional().nullable(),
  frequencia: z.enum(['mensal', 'avulso', 'anual', 'trimestral']).default('mensal'),
  valorPadrao: z.number().positive().optional().nullable(),
  ativo: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const ativo = searchParams.get('ativo')

    let query = adminDb.collection('servicos').orderBy('nome') as FirebaseFirestore.Query

    // Por padrão, busca apenas ativos
    if (ativo === null || ativo === 'true') {
      query = query.where('ativo', '==', true)
    } else if (ativo === 'false') {
      query = query.where('ativo', '==', false)
    }

    const snap = await query.get()
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

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const data = createSchema.parse(body)

    const now = Timestamp.now()
    const ref = await adminDb.collection('servicos').add({
      nome: data.nome,
      descricao: data.descricao ?? null,
      frequencia: data.frequencia,
      valorPadrao: data.valorPadrao ?? null,
      ativo: data.ativo,
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
