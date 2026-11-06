/**
 * Recálculo dos KPIs do Painel — lógica única do callable e do cron
 * (functions/src/dashboard.ts). Regras puras em ./dashboard-kpis-regras.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import {
  COLECAO_KPIS,
  COLECAO_KPIS_FINANCEIRO,
  contarPorStatus,
  idDocKpis,
  janelaVencimento,
  montarDocsKpis,
  somarValores,
  type MetaKpis,
} from './dashboard-kpis-regras'

type Firestore = FirebaseFirestore.Firestore
type Query = FirebaseFirestore.Query

async function contar(query: Query) {
  const snap = await query.count().get()
  return snap.data().count
}

async function somar(query: Query, campo: string) {
  const snap = await query.get()
  return somarValores(snap.docs.map((d) => d.data()[campo]))
}

export type ResultadoRecalculo = ReturnType<typeof montarDocsKpis> & { id: string }

export async function recalcularKpisTenant(
  db: Firestore,
  meta: MetaKpis,
  agora: Date = new Date(),
): Promise<ResultadoRecalculo> {
  const { tenantId, mes, ano } = meta
  const { inicioHoje, fimEm7Dias } = janelaVencimento(agora)
  const hojeTs = Timestamp.fromDate(inicioHoje)
  const em7DiasTs = Timestamp.fromDate(fimEm7Dias)
  const doTenant = (q: Query) => q.where('tenantId', '==', tenantId)

  const clientesAtivosQ = doTenant(db.collection('clientes').where('status', '==', 'ativo'))
  const competenciasMesQ = doTenant(db.collection('competencias').where('mes', '==', mes).where('ano', '==', ano))
  const tarefasAbertasQ = doTenant(db.collection('tarefas').where('status', 'in', ['pendente', 'em_andamento']))
  const receitaPendente = () =>
    doTenant(db.collection('lancamentos').where('tipo', '==', 'receita').where('status', '==', 'pendente'))
  const receitaVencendoQ = receitaPendente()
    .where('dataVencimento', '>=', hojeTs)
    .where('dataVencimento', '<=', em7DiasTs)
  const receitaAtrasadaQ = receitaPendente().where('dataVencimento', '<', hojeTs)

  const [
    totalClientesAtivos,
    tarefasPendentes,
    vencendoCount,
    atrasadosCount,
    somaVencendo,
    somaAtrasados,
    competenciasSnap,
  ] = await Promise.all([
    contar(clientesAtivosQ),
    contar(tarefasAbertasQ),
    contar(receitaVencendoQ),
    contar(receitaAtrasadaQ),
    somar(receitaVencendoQ, 'valor'),
    somar(receitaAtrasadaQ, 'valor'),
    competenciasMesQ.get(),
  ])

  const docs = montarDocsKpis(
    meta,
    {
      totalClientesAtivos,
      tarefasPendentes,
      compCounts: contarPorStatus(competenciasSnap.docs.map((d) => d.data().status)),
    },
    { somaVencendo, vencendoCount, somaAtrasados, atrasadosCount },
  )

  const id = idDocKpis(tenantId, ano, mes)
  const batch = db.batch()
  // Sem merge de propósito: substitui o doc inteiro (ver montarDocsKpis).
  batch.set(db.collection(COLECAO_KPIS).doc(id), { ...docs.operacional, atualizadoEm: FieldValue.serverTimestamp() })
  batch.set(db.collection(COLECAO_KPIS_FINANCEIRO).doc(id), {
    ...docs.financeiro,
    atualizadoEm: FieldValue.serverTimestamp(),
  })
  await batch.commit()

  return { id, ...docs }
}
