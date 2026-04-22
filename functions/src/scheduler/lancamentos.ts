/**
 * Scheduler: criação automática de lançamentos mensais
 *
 * Executa todo dia 5 às 01:00 BRT (04:00 UTC).
 * Para cada serviço ativo em clientes_servicos, cria um lançamento a receber
 * no mês corrente caso ainda não exista.
 *
 * O campo `diaVencimento` do serviço define o dia do mês em que a fatura vence.
 * Se não informado, usa o dia 10 como padrão.
 *
 * Coleções envolvidas:
 *   clientes_servicos — clienteId, status, valor, descricaoServico, diaVencimento
 *   clientes          — razaoSocial
 *   lancamentos       — documento criado aqui
 */
import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'

const db = () => admin.firestore()

const DIA_VENCIMENTO_PADRAO = 10

function buildDataVencimento(ano: number, mes: number, dia: number): Date {
  // Se o dia não existe no mês (ex: 31 em fevereiro), recua para o último dia
  const d = new Date(ano, mes - 1, dia)
  if (d.getMonth() !== mes - 1) {
    // Overshoots into next month — use last day of the intended month
    return new Date(ano, mes, 0) // day 0 = last day of previous month
  }
  return d
}

export const criarLancamentosMensais = onSchedule(
  {
    schedule:   '0 4 5 * *', // 01:00 BRT (= 04:00 UTC), todo dia 5
    timeZone:   'America/Sao_Paulo',
    region:     'southamerica-east1',
    memory:     '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const now = new Date()
    const mes = now.getMonth() + 1
    const ano = now.getFullYear()

    console.log(`[lancamentos] Criando lançamentos para ${mes}/${ano}`)

    // 1. Busca todos os serviços ativos
    const servicosSnap = await db()
      .collection('clientes_servicos')
      .where('status', '==', 'ativo')
      .get()

    if (servicosSnap.empty) {
      console.log('[lancamentos] Nenhum serviço ativo encontrado.')
      return
    }

    // 2. Cache de clientes para evitar leituras repetidas
    const clienteCache = new Map<string, string>()

    async function getRazaoSocial(clienteId: string): Promise<string | null> {
      if (clienteCache.has(clienteId)) return clienteCache.get(clienteId)!
      const doc = await db().collection('clientes').doc(clienteId).get()
      if (!doc.exists || doc.data()?.status === 'inativo') return null
      const nome = (doc.data()?.razaoSocial ?? '') as string
      clienteCache.set(clienteId, nome)
      return nome
    }

    let criados   = 0
    let ignorados = 0

    for (const servicoDoc of servicosSnap.docs) {
      const servico = servicoDoc.data()
      const clienteId = servico.clienteId as string

      // Checa se já existe lançamento para este serviço/mês/ano
      const jaExiste = await db()
        .collection('lancamentos')
        .where('servicoId', '==', servicoDoc.id)
        .where('mes', '==', mes)
        .where('ano', '==', ano)
        .limit(1)
        .get()

      if (!jaExiste.empty) {
        ignorados++
        continue
      }

      const razaoSocial = await getRazaoSocial(clienteId)
      if (!razaoSocial) {
        ignorados++
        continue
      }

      const diaVencimento = (servico.diaVencimento ?? DIA_VENCIMENTO_PADRAO) as number
      const dataVencimento = buildDataVencimento(ano, mes, diaVencimento)
      const descricao = (servico.descricaoServico ?? servico.nomeServico ?? servico.descricao ?? 'Honorários contábeis') as string

      await db().collection('lancamentos').add({
        clienteId,
        clienteNome:    razaoSocial,
        servicoId:      servicoDoc.id,
        tipo:           'receita',
        natureza:       'servico_contabil',
        status:         'pendente',
        valor:          (servico.valor ?? 0) as number,
        descricao:      `${descricao} — ${String(mes).padStart(2, '0')}/${ano}`,
        dataVencimento: Timestamp.fromDate(dataVencimento),
        mes,
        ano,
        competencia:    `${String(mes).padStart(2, '0')}/${ano}`,
        criadoEm:       Timestamp.now(),
        criadoAutomaticamente: true,
        dataBaixa:      null,
        contaBancaria:  null,
        observacoes:    '',
      })

      criados++
    }

    console.log(`[lancamentos] Criados: ${criados} | Ignorados (já existiam ou cliente inativo): ${ignorados}`)
  }
)
