/**
 * Scheduler: alertas diários por email
 *
 * Executa todo dia às 07:00 BRT (10:00 UTC).
 * Envia um email consolidado quando encontra:
 *   1. Tarefas vencendo nos próximos 3 dias (status != 'concluida' e != 'cancelada')
 *   2. Lançamentos atrasados (dataVencimento < hoje, status == 'pendente')
 *   3. Certificados digitais vencidos ou vencendo em até 30 dias
 *   4. NFS-e com erro, falhas de emissão das últimas 24 h (nfse_erros),
 *      cancelamento pendente ou rascunho aguardando emissão
 * Todo texto vindo do banco é escapado (tableHtml → escapeHtml).
 *
 * Destinatário: variável de ambiente EMAIL_TO (email do escritório).
 *
 * Coleções consultadas:
 *   tarefas         — responsavelNome, titulo, dataPrazo, status
 *   lancamentos     — clienteNome, descricao, dataVencimento, valor, status
 *   clientes_fiscal — clienteId, credenciais.certVencimento, credenciais.certTitular
 *   clientes        — razaoSocial (para enriquecer clientes_fiscal)
 */
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { sendEmail, tableHtml } from '../email/mailer'
import { emailSecrets } from '../email/secrets'

const db = () => getFirestore()

function fmtDate(ts: FirebaseFirestore.Timestamp | undefined | null): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleDateString('pt-BR')
}

function fmtMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const enviarAlertasDiarios = onSchedule(
  {
    schedule:       '0 10 * * *', // 07:00 BRT (= 10:00 UTC), todo dia
    timeZone:       'America/Sao_Paulo',
    region:         'southamerica-east1',
    memory:         '256MiB',
    timeoutSeconds: 120,
    secrets:        emailSecrets,
  },
  async () => {
    const hoje        = new Date()
    const em3Dias     = new Date(hoje); em3Dias.setDate(hoje.getDate() + 3)
    const em30Dias    = new Date(hoje); em30Dias.setDate(hoje.getDate() + 30)

    const tsHoje    = Timestamp.fromDate(hoje)
    const tsEm3     = Timestamp.fromDate(em3Dias)

    // ── 1. Tarefas vencendo nos próximos 3 dias ───────────────────────────────
    const tarefasSnap = await db()
      .collection('tarefas')
      .where('dataPrazo', '>=', tsHoje)
      .where('dataPrazo', '<=', tsEm3)
      .orderBy('dataPrazo', 'asc')
      .get()

    const tarefasAlerta = tarefasSnap.docs
      .filter((d) => !['concluida', 'cancelada'].includes(d.data().status as string))

    // ── 2. Lançamentos atrasados ──────────────────────────────────────────────
    const lancamentosSnap = await db()
      .collection('lancamentos')
      .where('status', '==', 'pendente')
      .where('dataVencimento', '<', tsHoje)
      .orderBy('dataVencimento', 'asc')
      .get()

    // ── 3. Certificados vencidos e vencendo em 30 dias ────────────────────────
    // Vencido entra também (antes só "vencendo"): A1 vencido para TODA emissão
    // e consulta do cliente no Ambiente Nacional — é o alerta mais urgente.
    const fiscalSnap = await db().collection('clientes_fiscal').get()
    const certAlertas: Array<{ cliente: string; titular: string; vencimento: string }> = []
    const certVencidos: Array<{ cliente: string; titular: string; vencimento: string }> = []

    for (const doc of fiscalSnap.docs) {
      const data = doc.data()
      const vencimentoStr = data?.credenciais?.certVencimento as string | undefined
      if (!vencimentoStr) continue
      const venc = new Date(vencimentoStr)
      if (Number.isNaN(venc.getTime()) || venc > em30Dias) continue
      const clienteDoc = await db().collection('clientes').doc(data.clienteId as string).get()
      const linha = {
        cliente:    (clienteDoc.data()?.razaoSocial ?? data.clienteId) as string,
        titular:    (data?.credenciais?.certTitular ?? '—') as string,
        vencimento: venc.toLocaleDateString('pt-BR'),
      }
      if (venc <= hoje) certVencidos.push(linha)
      else certAlertas.push(linha)
    }

    // Rascunhos travados em 'processando' não são mais destravados aqui (1x/dia):
    // a rotina reconciliarNfsePendentes (scheduler/nfse-reconciliacao.ts), a cada
    // 15 min, consulta a Sefin e registra a nota se ela tiver saído.

    // ── 4. Alertas NFS-e ─────────────────────────────────────────────────────
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const ha24h = Timestamp.fromMillis(hoje.getTime() - 24 * 60 * 60_000)
    const [nfseErroSnap, nfseCancelamentoSnap, nfseRascunhosSnap, rascunhosGeradosHojeSnap, nfseErros24hSnap] = await Promise.all([
      db().collection('nfse_emitidas').where('status', 'in', ['erro_integracao', 'rejeitada']).limit(50).get(),
      db().collection('nfse_emitidas').where('status', '==', 'cancelamento_pendente').limit(50).get(),
      db().collection('nfse_rascunhos').where('status', 'in', ['aguardando_emissao', 'erro_integracao']).limit(50).get(),
      // Semi-automático: rascunhos que o cron gerou HOJE e que aguardam revisão
      // humana (requerRevisao === true — não conta os de emissaoAutomatica, que
      // já saem emitidos e aparecem em nfse_erros/histórico, não aqui).
      db().collection('nfse_rascunhos')
        .where('origem', '==', 'nfse_recorrente')
        .where('requerRevisao', '==', true)
        .where('criadoEm', '>=', Timestamp.fromDate(inicioDoDia))
        .limit(100)
        .get(),
      // Falhas de emissão das últimas 24 h (manual, lote e automática) — é onde
      // processarEmissao grava cada recusa/timeout; o alerta não lia esta coleção.
      db().collection('nfse_erros').where('criadoEm', '>=', ha24h).orderBy('criadoEm', 'desc').limit(50).get(),
    ])

    // Se nada a alertar, não envia email
    if (
      tarefasAlerta.length === 0
      && lancamentosSnap.empty
      && certAlertas.length === 0
      && certVencidos.length === 0
      && nfseErros24hSnap.empty
      && nfseErroSnap.empty
      && nfseCancelamentoSnap.empty
      && nfseRascunhosSnap.empty
      && rascunhosGeradosHojeSnap.empty
    ) {
      console.log('[alertas] Nenhum alerta para enviar hoje.')
      return
    }

    // ── Monta email ───────────────────────────────────────────────────────────
    let html = `<div style="font-family:sans-serif;max-width:800px;margin:0 auto">`
    html += `<h1 style="color:#222;border-bottom:3px solid #f59e0b;padding-bottom:8px">Alertas TTRD Contábil — ${hoje.toLocaleDateString('pt-BR')}</h1>`

    if (tarefasAlerta.length > 0) {
      html += tableHtml(
        `⚠️ Tarefas vencendo em até 3 dias (${tarefasAlerta.length})`,
        ['Tarefa', 'Responsável', 'Cliente', 'Vencimento', 'Prioridade'],
        tarefasAlerta.map((d) => {
          const t = d.data()
          return [
            t.titulo as string ?? '—',
            t.responsavelNome as string ?? '—',
            t.clienteNome as string ?? '—',
            fmtDate(t.dataPrazo as FirebaseFirestore.Timestamp),
            t.prioridade as string ?? '—',
          ]
        })
      )
    }

    if (!lancamentosSnap.empty) {
      html += tableHtml(
        `🔴 Lançamentos atrasados (${lancamentosSnap.size})`,
        ['Cliente', 'Descrição', 'Vencimento', 'Valor'],
        lancamentosSnap.docs.map((d) => {
          const l = d.data()
          return [
            l.clienteNome as string ?? '—',
            l.descricao   as string ?? '—',
            fmtDate(l.dataVencimento as FirebaseFirestore.Timestamp),
            fmtMoney((l.valor ?? 0) as number),
          ]
        })
      )
    }

    if (certVencidos.length > 0) {
      html += tableHtml(
        `⛔ Certificados A1 VENCIDOS — emissão bloqueada (${certVencidos.length})`,
        ['Cliente', 'Titular', 'Venceu em'],
        certVencidos.map((c) => [c.cliente, c.titular, c.vencimento])
      )
    }

    if (!nfseErros24hSnap.empty) {
      html += tableHtml(
        `NFS-e que falharam nas últimas 24 h (${nfseErros24hSnap.size})`,
        ['Cliente', 'Quando', 'Código', 'Erro'],
        nfseErros24hSnap.docs.map((d) => {
          const e = d.data()
          const quando = (e.criadoEm as FirebaseFirestore.Timestamp | undefined)?.toDate()
          return [
            e.clienteNome ?? '—',
            quando ? quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—',
            e.codigoErro ?? '—',
            String(e.erro ?? '—').slice(0, 300),
          ]
        })
      )
    }

    if (certAlertas.length > 0) {
      html += tableHtml(
        `🔑 Certificados vencendo em 30 dias (${certAlertas.length})`,
        ['Cliente', 'Titular', 'Vencimento'],
        certAlertas.map((c) => [c.cliente, c.titular, c.vencimento])
      )
    }

    if (!nfseErroSnap.empty) {
      html += tableHtml(
        `NFS-e com erro (${nfseErroSnap.size})`,
        ['Cliente', 'Número', 'Status', 'Erro'],
        nfseErroSnap.docs.map((d) => {
          const n = d.data()
          return [
            n.clienteNome as string ?? '—',
            n.numeroNfse as string ?? '—',
            n.status as string ?? '—',
            n.erroUltimaTentativa as string ?? n.erroUltimaConsulta as string ?? '—',
          ]
        })
      )
    }

    if (!nfseCancelamentoSnap.empty) {
      html += tableHtml(
        `NFS-e com cancelamento pendente (${nfseCancelamentoSnap.size})`,
        ['Cliente', 'Número', 'Motivo'],
        nfseCancelamentoSnap.docs.map((d) => {
          const n = d.data()
          return [
            n.clienteNome as string ?? '—',
            n.numeroNfse as string ?? '—',
            n.motivoCancelamento as string ?? '—',
          ]
        })
      )
    }

    if (!nfseRascunhosSnap.empty) {
      html += tableHtml(
        `Rascunhos NFS-e pendentes (${nfseRascunhosSnap.size})`,
        ['Cliente', 'Status', 'Erro'],
        nfseRascunhosSnap.docs.map((d) => {
          const n = d.data()
          return [
            n.clienteNome as string ?? n.titulo as string ?? '—',
            n.status as string ?? '—',
            n.erroUltimaTentativa as string ?? '—',
          ]
        })
      )
    }

    if (!rascunhosGeradosHojeSnap.empty) {
      html += tableHtml(
        `📋 Rascunhos gerados automaticamente hoje, aguardando revisão (${rascunhosGeradosHojeSnap.size})`,
        ['Cliente', 'Competência', 'Valor previsto'],
        rascunhosGeradosHojeSnap.docs.map((d) => {
          const n = d.data()
          const dados = (n.dados ?? {}) as Record<string, unknown>
          return [
            n.clienteNome as string ?? n.titulo as string ?? '—',
            n.competencia as string ?? '—',
            fmtMoney(Number(dados.valorServico ?? 0)),
          ]
        })
      )
      html += `<p style="font-size:13px;color:#555;margin-top:-8px">Revise e emita esses rascunhos na tela Fiscal — eles não são enviados sozinhos.</p>`
    }

    html += `<p style="font-size:12px;color:#888;margin-top:24px">TTRD Contábil — alerta automático. Não responda este email.</p></div>`

    const totalAlertas =
      tarefasAlerta.length
      + lancamentosSnap.size
      + certAlertas.length
      + certVencidos.length
      + nfseErros24hSnap.size
      + nfseErroSnap.size
      + nfseCancelamentoSnap.size
      + nfseRascunhosSnap.size
      + rascunhosGeradosHojeSnap.size
    await sendEmail({
      subject: `[TTRD] ${totalAlertas} alerta(s) para hoje — ${hoje.toLocaleDateString('pt-BR')}`,
      html,
    })

    console.log(`[alertas] Email enviado. Tarefas: ${tarefasAlerta.length}, Lançamentos: ${lancamentosSnap.size}, Certs: ${certAlertas.length}, vencidos: ${certVencidos.length}, NFS-e erro: ${nfseErroSnap.size}, falhas 24h: ${nfseErros24hSnap.size}, cancelamento: ${nfseCancelamentoSnap.size}, rascunhos: ${nfseRascunhosSnap.size}, gerados hoje: ${rascunhosGeradosHojeSnap.size}`)
  }
)

/**
 * Marca tarefas com prazo crítico em 48h.
 * Campo usado pelo frontend para destaque visual no cockpit.
 */
export const alertasPrazoCritico = onSchedule(
  {
    schedule: '0 7 * * *', // 07:00 BRT, diário
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const agora = new Date()
    const em48h = new Date(agora)
    em48h.setHours(em48h.getHours() + 48)
    const tsAgora = Timestamp.fromDate(agora)
    const tsEm48h = Timestamp.fromDate(em48h)

    const criticasSnap = await db()
      .collection('tarefas')
      .where('status', 'in', ['pendente', 'em_andamento'])
      .where('dataPrazo', '>=', tsAgora)
      .where('dataPrazo', '<=', tsEm48h)
      .get()

    const flaggedSnap = await db()
      .collection('tarefas')
      .where('alertaPrazo48h', '==', true)
      .get()

    const criticasIds = new Set(criticasSnap.docs.map((d) => d.id))
    const updates: Array<{ ref: FirebaseFirestore.DocumentReference; alertaPrazo48h: boolean }> = []

    for (const doc of criticasSnap.docs) {
      updates.push({ ref: doc.ref, alertaPrazo48h: true })
    }
    for (const doc of flaggedSnap.docs) {
      if (!criticasIds.has(doc.id)) {
        updates.push({ ref: doc.ref, alertaPrazo48h: false })
      }
    }

    let batch = db().batch()
    let ops = 0
    for (const u of updates) {
      batch.update(u.ref, {
        alertaPrazo48h: u.alertaPrazo48h,
        atualizadoEm: Timestamp.now(),
      })
      ops++
      if (ops >= 400) {
        await batch.commit()
        batch = db().batch()
        ops = 0
      }
    }
    if (ops > 0) await batch.commit()

    console.log(`[alertas-prazo-48h] tarefas críticas=${criticasSnap.size}, atualizadas=${updates.length}`)
  }
)

/**
 * Marca clientes com risco de inadimplência crescente.
 * Regra: soma em atraso (receita pendente vencida) > R$ 500.
 */
export const detectarInadimplencia = onSchedule(
  {
    schedule: '0 8 * * 1', // segunda-feira, 08:00 BRT
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const hoje = Timestamp.fromDate(new Date())

    const atrasadosSnap = await db()
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pendente')
      .where('dataVencimento', '<', hoje)
      .get()

    const somaPorCliente = new Map<string, number>()
    for (const doc of atrasadosSnap.docs) {
      const data = doc.data()
      const clienteId = data.clienteId as string | undefined
      if (!clienteId) continue
      const valor = (data.valor ?? 0) as number
      somaPorCliente.set(clienteId, (somaPorCliente.get(clienteId) ?? 0) + valor)
    }

    const riscoIds = new Set(
      Array.from(somaPorCliente.entries())
        .filter(([, soma]) => soma > 500)
        .map(([clienteId]) => clienteId)
    )

    const clientesFlaggedSnap = await db()
      .collection('clientes')
      .where('riscoInadimplencia', '==', true)
      .get()

    const updates: Array<{ ref: FirebaseFirestore.DocumentReference; riscoInadimplencia: boolean }> = []
    for (const clienteId of riscoIds) {
      updates.push({
        ref: db().collection('clientes').doc(clienteId),
        riscoInadimplencia: true,
      })
    }
    for (const doc of clientesFlaggedSnap.docs) {
      if (!riscoIds.has(doc.id)) {
        updates.push({ ref: doc.ref, riscoInadimplencia: false })
      }
    }

    let batch = db().batch()
    let ops = 0
    for (const u of updates) {
      batch.set(
        u.ref,
        { riscoInadimplencia: u.riscoInadimplencia, atualizadoEm: Timestamp.now() },
        { merge: true }
      )
      ops++
      if (ops >= 400) {
        await batch.commit()
        batch = db().batch()
        ops = 0
      }
    }
    if (ops > 0) await batch.commit()

    console.log(`[inadimplencia] clientes em risco=${riscoIds.size}, atualizados=${updates.length}`)
  }
)
