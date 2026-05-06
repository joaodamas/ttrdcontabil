import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireEnvironmentTenant } from './tenant'

const db = () => admin.firestore()

type DashboardInput = {
  mes?: number
  ano?: number
}

async function assertDashboardUser(uid: string) {
  const snap = await db().collection('usuarios').doc(uid).get()
  if (!snap.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const usuario = snap.data() ?? {}
  if (usuario.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')

  const perfil = usuario.perfil as string | undefined
  if (!['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'].includes(perfil ?? '')) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para dashboard.')
  }

  return {
    id: uid,
    nome: (usuario.nome as string | undefined) ?? uid,
    perfil,
    tenantId: requireEnvironmentTenant(usuario.tenantId, 'Usuário'),
  }
}

function validateInput(data: unknown): Required<DashboardInput> {
  const now = new Date()
  const input = data as DashboardInput | undefined
  const mes = Number(input?.mes ?? now.getMonth() + 1)
  const ano = Number(input?.ano ?? now.getFullYear())
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new HttpsError('invalid-argument', 'Mês inválido para KPIs do dashboard.')
  }
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    throw new HttpsError('invalid-argument', 'Ano inválido para KPIs do dashboard.')
  }
  return { mes, ano }
}

function withTenant(query: FirebaseFirestore.Query, tenantId: string) {
  return query.where('tenantId', '==', tenantId)
}

async function count(query: FirebaseFirestore.Query) {
  const snap = await query.count().get()
  return snap.data().count
}

async function sum(query: FirebaseFirestore.Query, field: string) {
  const snap = await query.get()
  return snap.docs.reduce((acc, doc) => {
    const value = doc.data()[field]
    return acc + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  }, 0)
}

export const recalcularDashboardKpis = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB', invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const usuario = await assertDashboardUser(request.auth.uid)
    const { mes, ano } = validateInput(request.data)

    const hoje = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0)
    const em7Dias = new Date(inicioHoje)
    em7Dias.setDate(em7Dias.getDate() + 7)
    em7Dias.setHours(23, 59, 59, 999)
    const hojeTs = Timestamp.fromDate(inicioHoje)
    const em7DiasTs = Timestamp.fromDate(em7Dias)

    const clientesAtivosQ = withTenant(
      db().collection('clientes').where('status', '==', 'ativo'),
      usuario.tenantId
    )
    const competenciasMesQ = withTenant(
      db().collection('competencias').where('mes', '==', mes).where('ano', '==', ano),
      usuario.tenantId
    )
    const tarefasAbertasQ = withTenant(
      db().collection('tarefas').where('status', 'in', ['pendente', 'em_andamento']),
      usuario.tenantId
    )
    const receitaVencendoQ = withTenant(
      db()
        .collection('lancamentos')
        .where('tipo', '==', 'receita')
        .where('status', '==', 'pendente')
        .where('dataVencimento', '>=', hojeTs)
        .where('dataVencimento', '<=', em7DiasTs),
      usuario.tenantId
    )
    const receitaAtrasadaQ = withTenant(
      db()
        .collection('lancamentos')
        .where('tipo', '==', 'receita')
        .where('status', '==', 'pendente')
        .where('dataVencimento', '<', hojeTs),
      usuario.tenantId
    )

    const [
      totalClientesAtivos,
      tarefasPendentes,
      vencendoCount,
      atrasadosCount,
      somaVencendo,
      somaAtrasados,
      competenciasSnap,
    ] = await Promise.all([
      count(clientesAtivosQ),
      count(tarefasAbertasQ),
      count(receitaVencendoQ),
      count(receitaAtrasadaQ),
      sum(receitaVencendoQ, 'valor'),
      sum(receitaAtrasadaQ, 'valor'),
      competenciasMesQ.get(),
    ])

    const compCounts: Record<string, number> = {}
    for (const doc of competenciasSnap.docs) {
      const status = doc.data().status as string | undefined
      if (status) compCounts[status] = (compCounts[status] ?? 0) + 1
    }

    const docId = `${usuario.tenantId}_${ano}_${String(mes).padStart(2, '0')}`
    const payload = {
      tenantId: usuario.tenantId,
      mes,
      ano,
      totalClientesAtivos,
      compCounts,
      tarefasPendentes,
      somaVencendo,
      vencendoCount,
      somaAtrasados,
      atrasadosCount,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPorId: usuario.id,
      atualizadoPorNome: usuario.nome,
      origem: 'cloud_function',
    }

    await db().collection('dashboard_kpis').doc(docId).set(payload, { merge: true })
    await db().collection('logs_auditoria').add({
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      entidade: 'dashboard_kpis',
      entidadeId: docId,
      acao: 'upsert',
      dadosAntes: null,
      dadosDepois: {
        mes,
        ano,
        totalClientesAtivos,
        tarefasPendentes,
        vencendoCount,
        atrasadosCount,
      },
      origem: 'cloud_function',
      criadoEm: FieldValue.serverTimestamp(),
    })

    return { id: docId, ...payload, atualizadoEm: new Date().toISOString() }
  }
)
