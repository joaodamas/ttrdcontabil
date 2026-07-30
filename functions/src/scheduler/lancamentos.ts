/**
 * Scheduler: criação automática de lançamentos mensais
 *
 * Executa no dia 1 às 06:00 (America/Sao_Paulo).
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
import { DEFAULT_TENANT_ID } from '../tenant'
import { SYSTEM_ACTOR, writeAuditLog } from '../audit'
import { deveFaturarNoMes, vigenteNoMes } from './recorrencia'

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
    schedule:   '0 6 1 * *', // 06:00 BRT, dia 1
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
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get()

    if (servicosSnap.empty) {
      console.log('[lancamentos] Nenhum serviço ativo encontrado.')
      return
    }

    // 2. Busca clientes de forma batched para evitar N+1
    const clienteIds = Array.from(
      new Set(servicosSnap.docs.map((d) => (d.data().clienteId as string)).filter(Boolean))
    )
    const clienteRefs = clienteIds.map((id) => db().collection('clientes').doc(id))
    const clienteDocs = clienteRefs.length > 0 ? await db().getAll(...clienteRefs) : []
    const clienteAtivoMap = new Map<string, string>()
    for (const c of clienteDocs) {
      if (!c.exists) continue
      const data = c.data()
      if (!data || data.status === 'inativo' || data.deletedAt) continue
      if (data.tenantId !== DEFAULT_TENANT_ID) continue
      clienteAtivoMap.set(c.id, (data.razaoSocial ?? '') as string)
    }

    // 3. Busca lançamentos já existentes do mês para evitar duplicatas
    const existentesSnap = await db()
      .collection('lancamentos')
      .where('mes', '==', mes)
      .where('ano', '==', ano)
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get()
    const servicosComLancamento = new Set(
      existentesSnap.docs
        .map((d) => d.data().servicoId as string | undefined)
        .filter((v): v is string => !!v)
    )

    let criados = 0
    let ignorados = 0
    let batch = db().batch()
    let ops = 0

    for (const servicoDoc of servicosSnap.docs) {
      const servico = servicoDoc.data()
      const clienteId = servico.clienteId as string

      if (servicosComLancamento.has(servicoDoc.id)) {
        ignorados++
        continue
      }

      const razaoSocial = clienteAtivoMap.get(clienteId)
      if (!razaoSocial) {
        ignorados++
        continue
      }

      if (!deveFaturarNoMes(servico, mes)) {
        ignorados++
        continue
      }

      if (!vigenteNoMes(servico, ano, mes)) {
        ignorados++
        continue
      }

      const diaVencimento = (servico.diaVencimento ?? DIA_VENCIMENTO_PADRAO) as number
      const dataVencimento = buildDataVencimento(ano, mes, diaVencimento)
      // `servicoNome` PRIMEIRO: é o campo que o formulário de contrato grava.
      // Nenhuma das três chaves antigas existe em documento algum, então toda a
      // carteira caía no literal genérico — a coluna "Serviço / Referência"
      // mentia para os 119 clientes. O gerador de competências já lia o campo
      // certo (scheduler/competencias.ts); este ficou para trás.
      const descricao = (servico.servicoNome
        ?? servico.descricaoServico
        ?? servico.nomeServico
        ?? servico.descricao
        ?? 'Honorários contábeis') as string

      // Mesmo id determinístico usado por criarCompetenciasMensais (competencias.ts):
      // `${clienteId}_${clienteServicoId}_${ano}_${mes}`. servicoDoc.id aqui é o id do
      // doc em clientes_servicos, o mesmo usado como clienteServicoId na competência —
      // isso vincula o honorário à competência do cliente+serviço do mês, mesmo que
      // ela ainda não exista no momento da criação.
      const competenciaId = `${clienteId}_${servicoDoc.id}_${ano}_${String(mes).padStart(2, '0')}`

      const tenantId = DEFAULT_TENANT_ID
      const ref = db()
        .collection('lancamentos')
        .doc(`${tenantId}_${ano}_${String(mes).padStart(2, '0')}_${servicoDoc.id}`)
      batch.set(ref, {
        tenantId,
        clienteId,
        clienteNome: razaoSocial,
        servicoId: servicoDoc.id,
        competenciaId,
        tipo: 'receita',
        natureza: 'servico_contabil',
        status: 'pendente',
        valor: (servico.valor ?? 0) as number,
        descricao: `${descricao} — ${String(mes).padStart(2, '0')}/${ano}`,
        dataVencimento: Timestamp.fromDate(dataVencimento),
        mes,
        ano,
        competencia: `${String(mes).padStart(2, '0')}/${ano}`,
        criadoEm: Timestamp.now(),
        criadoPorId: SYSTEM_ACTOR.id,
        criadoPorNome: SYSTEM_ACTOR.nome,
        criadoAutomaticamente: true,
        dataBaixa: null,
        contaBancaria: null,
        observacoes: '',
      })
      ops++
      criados++
      servicosComLancamento.add(servicoDoc.id)

      if (ops >= 400) {
        await batch.commit()
        batch = db().batch()
        ops = 0
      }
    }

    if (ops > 0) await batch.commit()

    await writeAuditLog({
      tenantId: DEFAULT_TENANT_ID,
      actor: SYSTEM_ACTOR,
      entidade: 'lancamentos',
      entidadeId: `${ano}_${String(mes).padStart(2, '0')}`,
      acao: 'scheduler_batch_create',
      dadosAntes: null,
      dadosDepois: {
        mes,
        ano,
        criados,
        ignorados,
        totalServicosAtivos: servicosSnap.size,
      },
      origem: 'scheduler',
    })

    console.log(`[lancamentos] Criados: ${criados} | Ignorados (duplicado/inativo): ${ignorados}`)
  }
)
