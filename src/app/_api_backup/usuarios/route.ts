export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(150),
  email: z.string().email('E-mail inválido').max(150),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  perfil: z
    .enum(['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'])
    .default('operacional'),
  ativo: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(req.url)
    const ativo = searchParams.get('ativo')
    const perfil = searchParams.get('perfil')

    let query = adminDb.collection('usuarios').orderBy('nome') as FirebaseFirestore.Query

    if (ativo !== null) query = query.where('ativo', '==', ativo !== 'false')
    if (perfil) query = query.where('perfil', '==', perfil)

    const snap = await query.get()
    const usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ usuarios })
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

    // Cria usuário no Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.senha,
      displayName: data.nome,
    })

    const now = Timestamp.now()
    await adminDb.collection('usuarios').doc(userRecord.uid).set({
      nome: data.nome,
      email: data.email,
      perfil: data.perfil,
      ativo: data.ativo,
      criadoEm: now,
      atualizadoEm: now,
    })

    return NextResponse.json(
      {
        uid: userRecord.uid,
        nome: data.nome,
        email: data.email,
        perfil: data.perfil,
        ativo: data.ativo,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    // Firebase Auth duplicate email
    if ((error as { code?: string }).code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'E-mail já está em uso' }, { status: 409 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
