export const dynamic = 'force-static'
export function generateStaticParams() { return [] }
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const updateSchema = z.object({
  nome: z.string().min(1).max(150).optional(),
  email: z.string().email('E-mail inválido').max(150).optional(),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').optional(),
  perfil: z
    .enum(['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'])
    .optional(),
  ativo: z.boolean().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id } = await params

    // Admin pode ver qualquer usuário; outros só a si mesmos
    if (session.perfil !== 'admin' && session.uid !== id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const doc = await adminDb.collection('usuarios').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
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
    const session = await requireAuth()
    const { id } = await params

    const isAdmin = session.perfil === 'admin'
    const isSelf = session.uid === id

    if (!isAdmin && !isSelf) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json()
    const data = updateSchema.parse(body)

    if (!isAdmin) {
      if (data.perfil !== undefined) {
        return NextResponse.json({ error: 'Sem permissão para alterar perfil' }, { status: 403 })
      }
      if (data.ativo !== undefined) {
        return NextResponse.json({ error: 'Sem permissão para alterar status' }, { status: 403 })
      }
    }

    const doc = await adminDb.collection('usuarios').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const firestoreUpdate: Record<string, unknown> = { atualizadoEm: Timestamp.now() }
    if (data.nome !== undefined) firestoreUpdate.nome = data.nome
    if (data.email !== undefined) firestoreUpdate.email = data.email
    if (data.perfil !== undefined) firestoreUpdate.perfil = data.perfil
    if (data.ativo !== undefined) firestoreUpdate.ativo = data.ativo

    // Atualiza no Firebase Auth
    const authUpdate: Parameters<typeof adminAuth.updateUser>[1] = {}
    if (data.nome !== undefined) authUpdate.displayName = data.nome
    if (data.email !== undefined) authUpdate.email = data.email
    if (data.senha !== undefined) authUpdate.password = data.senha
    if (data.ativo !== undefined) authUpdate.disabled = !data.ativo

    if (Object.keys(authUpdate).length > 0) {
      await adminAuth.updateUser(id, authUpdate)
    }

    await adminDb.collection('usuarios').doc(id).update(firestoreUpdate)

    const updated = await adminDb.collection('usuarios').doc(id).get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin()
    const { id } = await params

    if (session.uid === id) {
      return NextResponse.json({ error: 'Não é possível desativar sua própria conta' }, { status: 400 })
    }

    const doc = await adminDb.collection('usuarios').doc(id).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const data = doc.data()!
    if (!data.ativo) {
      return NextResponse.json({ error: 'Usuário já está inativo' }, { status: 400 })
    }

    // Soft delete: desativa no Firestore e no Auth
    await Promise.all([
      adminDb
        .collection('usuarios')
        .doc(id)
        .update({ ativo: false, atualizadoEm: Timestamp.now() }),
      adminAuth.updateUser(id, { disabled: true }),
    ])

    return NextResponse.json({ ok: true, message: 'Usuário desativado com sucesso' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
