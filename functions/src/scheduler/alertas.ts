/**
 * Scheduler: alertas diários por email
 *
 * Executa todo dia às 07:00 BRT (10:00 UTC).
 * Envia um email consolidado quando encontra:
 *   1. Tarefas vencendo nos próximos 3 dias (status != 'concluida' e != 'cancelada')
 *   2. Lançamentos atrasados (dataVencimento < hoje, status == 'pendente')
 *   3. Certificados digitais vencendo em até 30 dias
 *
 * Destinatário: variável de ambiente EMAIL_TO (email do escritório).
 *
 * Coleções consultadas:
 *   tarefas         — responsavelNome, titulo, dataVencimento, status
 *   lancamentos     — clienteNome, descricao, dataVencimento, valor, status
 *   clientes_fiscal — clienteId, credenciais.certVencimento, credenciais.certTitular
 *   clientes        — razaoSocial (para enriquecer clientes_fiscal)
 */
import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'
import { sendEmail, tableHtml } from '../email/mailer'

const db = () => admin.firestore()

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
      .where('dataVencimento', '>=', tsHoje)
      .where('dataVencimento', '<=', tsEm3)
      .orderBy('dataVencimento', 'asc')
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

    // ── 3. Certificados vencendo em 30 dias ───────────────────────────────────
    const fiscalSnap = await db().collection('clientes_fiscal').get()
    const certAlertas: Array<{ cliente: string; titular: string; vencimento: string }> = []

    for (const doc of fiscalSnap.docs) {
      const data = doc.data()
      const vencimentoStr = data?.credenciais?.certVencimento as string | undefined
      if (!vencimentoStr) continue
      const venc = new Date(vencimentoStr)
      if (venc > hoje && venc <= em30Dias) {
        // Busca razaoSocial
        const clienteDoc = await db().collection('clientes').doc(data.clienteId as string).get()
        certAlertas.push({
          cliente:    (clienteDoc.data()?.razaoSocial ?? data.clienteId) as string,
          titular:    (data?.credenciais?.certTitular ?? '—') as string,
          vencimento: venc.toLocaleDateString('pt-BR'),
        })
      }
    }

    // Se nada a alertar, não envia email
    if (tarefasAlerta.length === 0 && lancamentosSnap.empty && certAlertas.length === 0) {
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
            fmtDate(t.dataVencimento as FirebaseFirestore.Timestamp),
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

    if (certAlertas.length > 0) {
      html += tableHtml(
        `🔑 Certificados vencendo em 30 dias (${certAlertas.length})`,
        ['Cliente', 'Titular', 'Vencimento'],
        certAlertas.map((c) => [c.cliente, c.titular, c.vencimento])
      )
    }

    html += `<p style="font-size:12px;color:#888;margin-top:24px">TTRD Contábil — alerta automático. Não responda este email.</p></div>`

    const totalAlertas = tarefasAlerta.length + lancamentosSnap.size + certAlertas.length
    await sendEmail({
      subject: `[TTRD] ${totalAlertas} alerta(s) para hoje — ${hoje.toLocaleDateString('pt-BR')}`,
      html,
    })

    console.log(`[alertas] Email enviado. Tarefas: ${tarefasAlerta.length}, Lançamentos: ${lancamentosSnap.size}, Certs: ${certAlertas.length}`)
  }
)
