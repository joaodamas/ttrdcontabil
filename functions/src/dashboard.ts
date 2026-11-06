import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { SYSTEM_ACTOR } from './audit'
import { assertPerfil } from './authz'
import { recalcularKpisTenant } from './dashboard-kpis'
import { ErroEntradaKpis, FUSO_ESCRITORIO, validarMesAno } from './dashboard-kpis-regras'
import { DEFAULT_TENANT_ID } from './tenant'
import { PERFIS, podeLerFinanceiro } from './usuarios/perfis'

const db = () => admin.firestore()

// Qualquer perfil ativo vê o Painel e pode pedir o recálculo — mas só recebe
// de volta os KPIs financeiros quem lê lançamentos (canReadFinanceiro nas regras).
const assertDashboardUser = (uid: string) => assertPerfil(uid, PERFIS, 'Perfil sem permissão para dashboard.')

export const recalcularDashboardKpis = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB', invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const usuario = await assertDashboardUser(request.auth.uid)
    const agora = new Date()
    let mesAno: { mes: number; ano: number }
    try {
      mesAno = validarMesAno(request.data, agora)
    } catch (err) {
      if (err instanceof ErroEntradaKpis) throw new HttpsError('invalid-argument', err.message)
      throw err
    }

    const resultado = await recalcularKpisTenant(
      db(),
      {
        tenantId: usuario.tenantId,
        ...mesAno,
        atualizadoPorId: usuario.id,
        atualizadoPorNome: usuario.nome,
        origem: 'cloud_function',
      },
      agora,
    )

    await db().collection('logs_auditoria').add({
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      entidade: 'dashboard_kpis',
      entidadeId: resultado.id,
      acao: 'upsert',
      dadosAntes: null,
      dadosDepois: {
        mes: mesAno.mes,
        ano: mesAno.ano,
        totalClientesAtivos: resultado.operacional.totalClientesAtivos,
        tarefasPendentes: resultado.operacional.tarefasPendentes,
      },
      origem: 'cloud_function',
      criadoEm: FieldValue.serverTimestamp(),
    })

    const atualizadoEm = agora.toISOString()
    return {
      id: resultado.id,
      ...resultado.operacional,
      atualizadoEm,
      ...(podeLerFinanceiro(usuario) ? { financeiro: { ...resultado.financeiro, atualizadoEm } } : {}),
    }
  }
)

/**
 * Recalcula os KPIs do mês corrente de hora em hora no horário comercial
 * (seg–sáb, 7h–20h de Brasília). Antes o único escritor era o callable, e a
 * tela só o chamava quando o doc do mês não existia: depois do 1º acesso o
 * Painel ficava congelado no número daquela hora até virar o mês. A tela
 * também recalcula quando o doc tem mais de 1 h (fora deste horário).
 */
export const recalcularDashboardKpisAgendado = onSchedule(
  {
    schedule: '0 7-20 * * 1-6',
    timeZone: FUSO_ESCRITORIO,
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const agora = new Date()
    const mesAno = validarMesAno(undefined, agora)
    try {
      const { id } = await recalcularKpisTenant(
        db(),
        {
          tenantId: DEFAULT_TENANT_ID,
          ...mesAno,
          atualizadoPorId: SYSTEM_ACTOR.id,
          atualizadoPorNome: SYSTEM_ACTOR.nome,
          origem: 'scheduler',
        },
        agora,
      )
      logger.info('[dashboard-kpis] recalculado', { id })
    } catch (err) {
      logger.error('[dashboard-kpis][falha]', {
        tenantId: DEFAULT_TENANT_ID,
        ...mesAno,
        erro: err instanceof Error ? err.message : String(err),
      })
      // Propaga para a execução aparecer como falha no Cloud Scheduler/Run.
      throw err
    }
  }
)
