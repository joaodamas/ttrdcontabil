export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { FechamentoClientPage } from './client'

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string; regime?: string }>
}) {
  await requireAuth()
  const sp = await searchParams

  const hoje = new Date()
  const mes = parseInt(sp.mes ?? String(hoje.getMonth() + 1))
  const ano = parseInt(sp.ano ?? String(hoje.getFullYear()))
  const regime = sp.regime ?? ''

  let query = adminDb
    .collection('fechamentos')
    .where('mes', '==', mes)
    .where('ano', '==', ano) as FirebaseFirestore.Query

  if (regime) query = query.where('regime', '==', regime)
  query = query.orderBy('clienteCodigo', 'asc')

  const snap = await query.get()
  const fechamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>

  // Resumo por status
  const total = fechamentos.length
  const enviados = fechamentos.filter((f) => f.dasStatus === 'enviado' || f.dasStatus === 'ok').length
  const pendentes = fechamentos.filter((f) => f.dasStatus === 'pendente').length
  const parciais  = fechamentos.filter((f) => f.dasStatus === 'parcial').length

  return (
    <FechamentoClientPage
      fechamentos={fechamentos}
      mes={mes}
      ano={ano}
      regime={regime}
      mesLabel={MESES[mes - 1]}
      resumo={{ total, enviados, pendentes, parciais }}
    />
  )
}
