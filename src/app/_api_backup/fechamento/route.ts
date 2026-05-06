export const dynamic = 'force-static'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  mes: z.number().min(1).max(12),
  ano: z.number().min(2020).max(2099),
  gerarParaTodos: z.boolean().default(false), // gera fechamentos para todos os clientes ativos
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const mes = parseInt(searchParams.get('mes') ?? String(new Date().getMonth() + 1))
    const ano = parseInt(searchParams.get('ano') ?? String(new Date().getFullYear()))
    const regime = searchParams.get('regime')

    let query = adminDb
      .collection('fechamentos')
      .where('mes', '==', mes)
      .where('ano', '==', ano) as FirebaseFirestore.Query

    if (regime) query = query.where('regime', '==', regime)

    query = query.orderBy('clienteCodigo', 'asc')

    const snap = await query.get()
    const fechamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ fechamentos, total: fechamentos.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const { mes, ano } = createSchema.parse(body)

    // Busca todos os clientes ativos
    const clientesSnap = await adminDb
      .collection('clientes')
      .where('status', '==', 'ativo')
      .orderBy('codigo', 'asc')
      .get()

    const now = Timestamp.now()
    const batch = adminDb.batch()
    let criados = 0

    for (const clienteDoc of clientesSnap.docs) {
      const cliente = clienteDoc.data()
      // Verifica se já existe
      const existSnap = await adminDb
        .collection('fechamentos')
        .where('clienteId', '==', clienteDoc.id)
        .where('mes', '==', mes)
        .where('ano', '==', ano)
        .limit(1)
        .get()

      if (!existSnap.empty) continue

      const ref = adminDb.collection('fechamentos').doc()
      batch.set(ref, {
        clienteId: clienteDoc.id,
        clienteNome: cliente.razaoSocial,
        clienteCodigo: cliente.codigo ?? 0,
        mes,
        ano,
        regime: cliente.regimeTributario ?? 'simples_nacional',
        responsavel: cliente.responsavelNome ?? '',
        portalUrl: cliente.portalUrl ?? null,
        formaEntrega: cliente.formaEntrega ?? null,
        dasStatus: 'pendente',
        esocialStatus: 'na',
        reinfStatus: 'na',
        fgtsStatus: 'na',
        criadoEm: now,
        atualizadoEm: now,
      })
      criados++
    }

    await batch.commit()
    return NextResponse.json({ criados })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
