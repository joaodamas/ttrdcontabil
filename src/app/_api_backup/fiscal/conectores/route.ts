export const dynamic = 'force-static'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'

export async function GET() {
  try {
    await requireAuth()

    const snap = await adminDb
      .collection('fiscal_conectores')
      .where('ativo', '==', true)
      .orderBy('nome')
      .get()

    const conectores = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ conectores })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
