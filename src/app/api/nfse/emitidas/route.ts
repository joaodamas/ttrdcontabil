import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

const createSchema = z.object({
  clienteId: z.string().min(1, 'clienteId obrigatório'),
  competenciaId: z.string().optional().nullable(),
  clienteServicoId: z.string().optional().nullable(),
  conectorId: z.string().optional().nullable(),
  rascunhoId: z.string().optional().nullable(),
  lancamentoId: z.string().optional().nullable(),
  numeroRps: z.string().optional().nullable(),
  tomadorNome: z.string().optional().nullable(),
  tomadorCpfCnpj: z.string().optional().nullable(),
  tomadorEmail: z.string().optional().nullable(),
  tomadorMunicipio: z.string().optional().nullable(),
  tomadorUf: z.string().optional().nullable(),
  descricaoServico: z.string().min(1, 'Descrição do serviço é obrigatória'),
  codigoServico: z.string().optional().nullable(),
  valorServico: z.number().positive('Valor deve ser positivo'),
  valorDeducoes: z.number().min(0).default(0),
  aliquota: z.number().min(0).max(100).optional().nullable(),
  issRetido: z.boolean().default(false),
  tipoIntegracao: z
    .enum(['nacional', 'prefeitura', 'provedor', 'manual_assistido'])
    .default('manual_assistido'),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId')
    const status = searchParams.get('status')
    const mes = searchParams.get('mes')
    const ano = searchParams.get('ano')

    let query = adminDb.collection('nfse_emitidas') as FirebaseFirestore.Query

    if (clienteId) query = query.where('clienteId', '==', clienteId)
    if (status) query = query.where('status', '==', status)

    query = query.orderBy('criadoEm', 'desc')

    const snap = await query.get()
    let notas = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>

    // Filtro de mês/ano em memória (dataEmissao é Timestamp)
    if (mes || ano) {
      notas = notas.filter((n) => {
        const dataEmissao = n.dataEmissao as Timestamp | undefined
        if (!dataEmissao) return false
        const dt = dataEmissao.toDate()
        if (mes && dt.getMonth() + 1 !== parseInt(mes)) return false
        if (ano && dt.getFullYear() !== parseInt(ano)) return false
        return true
      })
    }

    return NextResponse.json({ notas })
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

    // Denormaliza conector
    let conectorNome: string | null = null
    if (data.conectorId) {
      const cDoc = await adminDb.collection('fiscal_conectores').doc(data.conectorId).get()
      if (cDoc.exists) conectorNome = cDoc.data()!.nome ?? null
    }

    const statusInicial =
      data.tipoIntegracao === 'manual_assistido' ? 'emitida' : 'pendente_processamento'

    const now = Timestamp.now()
    const ref = await adminDb.collection('nfse_emitidas').add({
      clienteId: data.clienteId,
      clienteNome: clienteData.razaoSocial,
      competenciaId: data.competenciaId ?? null,
      clienteServicoId: data.clienteServicoId ?? null,
      conectorId: data.conectorId ?? null,
      conectorNome: conectorNome,
      rascunhoId: data.rascunhoId ?? null,
      lancamentoId: data.lancamentoId ?? null,
      numeroRps: data.numeroRps ?? null,
      numeroNfse: null,
      status: statusInicial,
      dataEmissao: data.tipoIntegracao === 'manual_assistido' ? now : null,
      tomadorNome: data.tomadorNome ?? null,
      tomadorCpfCnpj: data.tomadorCpfCnpj ?? null,
      tomadorEmail: data.tomadorEmail ?? null,
      tomadorMunicipio: data.tomadorMunicipio ?? null,
      tomadorUf: data.tomadorUf ?? null,
      descricaoServico: data.descricaoServico,
      codigoServico: data.codigoServico ?? null,
      valorServico: data.valorServico,
      valorDeducoes: data.valorDeducoes,
      valorLiquido: data.valorServico - data.valorDeducoes,
      aliquota: data.aliquota ?? null,
      issRetido: data.issRetido,
      valorIss: data.aliquota
        ? ((data.valorServico - data.valorDeducoes) * data.aliquota) / 100
        : null,
      emitidoPorId: session.uid,
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
