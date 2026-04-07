export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { z } from 'zod'

const loginSchema = z.object({
  idToken: z.string().min(1, 'idToken obrigatório'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { idToken } = loginSchema.parse(body)

    // Verifica o idToken
    const decoded = await adminAuth.verifyIdToken(idToken)

    // Busca dados do usuário no Firestore
    const userDoc = await adminDb.collection('usuarios').doc(decoded.uid).get()
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const userData = userDoc.data()!
    if (!userData.ativo) {
      return NextResponse.json({ error: 'Usuário inativo' }, { status: 403 })
    }

    // Cria session cookie (8 horas)
    const expiresIn = 8 * 60 * 60 * 1000
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn })

    // Atualiza último acesso
    const { Timestamp } = await import('firebase-admin/firestore')
    await adminDb.collection('usuarios').doc(decoded.uid).update({
      ultimoAcesso: Timestamp.now(),
    })

    const response = NextResponse.json({
      usuario: {
        uid: decoded.uid,
        nome: userData.nome,
        email: userData.email,
        perfil: userData.perfil,
      },
    })

    response.cookies.set('ttrd_session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('[LOGIN ERROR]', error)
    return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 })
  }
}
