/**
 * Scheduler: criação automática de competências
 *
 * Executa todo dia 1º às 01:00 BRT (04:00 UTC).
 * Para cada serviço ativo de cliente ativo, cria uma competência no mês
 * corrente caso ainda não exista.
 *
 * Coleções envolvidas:
 *   clientes          — razaoSocial, status
 *   clientes_servicos — clienteId, status ('ativo'), valor, descricaoServico
 *   competencias      — documento criado aqui
 */
import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'
import { DEFAULT_TENANT_ID } from '../tenant'
import { SYSTEM_ACTOR, writeAuditLog } from '../audit'

const db = () => admin.firestore()

export const criarCompetenciasMensais = onSchedule(
  {
    schedule:   '0 4 1 * *', // 01:00 BRT (= 04:00 UTC), todo dia 1º
    timeZone:   'America/Sao_Paulo',
    region:     'southamerica-east1',
    memory:     '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const now  = new Date()
    const mes  = now.getMonth() + 1  // 1–12
    const ano  = now.getFullYear()

    console.log(`[competencias] Criando competências para ${mes}/${ano}`)

    // 1. Busca todos os serviços ativos
    const servicosSnap = await db()
      .collection('clientes_servicos')
      .where('status', '==', 'ativo')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get()

    if (servicosSnap.empty) {
      console.log('[competencias] Nenhum serviço ativo encontrado.')
      return
    }

    // 2. Agrupa serviços por clienteId
    const porCliente = new Map<string, Array<{ id: string; servicoId?: string; nome: string; valor: number }>>()
    for (const doc of servicosSnap.docs) {
      const d = doc.data()
      const cid = d.clienteId as string
      if (!porCliente.has(cid)) porCliente.set(cid, [])
      porCliente.get(cid)!.push({
        id:        doc.id,
        servicoId: d.servicoId as string | undefined,
        nome:      (d.servicoNome ?? d.descricaoServico ?? d.nomeServico ?? d.descricao ?? 'Serviço') as string,
        valor:     (d.valor ?? 0) as number,
      })
    }

    // 3. Para cada cliente, verifica se a competência já existe antes de criar
    let batch    = db().batch()
    let batchOps = 0
    let criadas  = 0
    let ignoradas = 0

    for (const [clienteId, servicos] of porCliente.entries()) {
      // Busca razaoSocial do cliente
      const clienteDoc = await db().collection('clientes').doc(clienteId).get()
      if (!clienteDoc.exists || clienteDoc.data()?.status !== 'ativo' || clienteDoc.data()?.tenantId !== DEFAULT_TENANT_ID) {
        ignoradas += servicos.length
        continue
      }

      const razaoSocial = (clienteDoc.data()?.razaoSocial ?? '') as string

      for (const servico of servicos) {
        const competenciaId = `${clienteId}_${servico.id}_${ano}_${String(mes).padStart(2, '0')}`
        const ref = db().collection('competencias').doc(competenciaId)
        const jaExiste = await ref.get()
        if (jaExiste.exists) {
          ignoradas++
          continue
        }

        batch.set(ref, {
          tenantId: DEFAULT_TENANT_ID,
          clienteId,
          clienteNome:       razaoSocial,
          clienteServicoId:  servico.id,
          servicoId:         servico.servicoId ?? null,
          servicoNome:       servico.nome,
          mes,
          ano,
          competencia:       `${String(mes).padStart(2, '0')}/${ano}`,
          status:            'aberta',
          valorTotal:        servico.valor,
          observacoes:       '',
          criadoEm:          Timestamp.now(),
          atualizadoEm:      Timestamp.now(),
          criadoPorId:       SYSTEM_ACTOR.id,
          criadoPorNome:     SYSTEM_ACTOR.nome,
          criadoAutomaticamente: true,
        })

        const prazo = new Date(ano, mes - 1, 20, 12, 0, 0)
        const tarefaRef = db().collection('tarefas').doc(`${competenciaId}_execucao`)
        batch.set(tarefaRef, {
          tenantId: DEFAULT_TENANT_ID,
          clienteId,
          clienteNome:      razaoSocial,
          competenciaId,
          titulo:           `Executar ${servico.nome} - ${String(mes).padStart(2, '0')}/${ano}`,
          descricao:        'Tarefa recorrente criada automaticamente a partir do serviço contratado.',
          prioridade:       'normal',
          status:           'pendente',
          dataPrazo:        Timestamp.fromDate(prazo),
          criadoEm:         Timestamp.now(),
          atualizadoEm:     Timestamp.now(),
          criadoPorId:      SYSTEM_ACTOR.id,
          criadoPorNome:    SYSTEM_ACTOR.nome,
          criadoAutomaticamente: true,
        })

        criadas++
        batchOps += 2

        // Firestore batch limit is 500 — commit and start a fresh batch
        if (batchOps >= 400) {
          await batch.commit()
          batch    = db().batch()
          batchOps = 0
        }
      }
    }

    if (batchOps > 0) await batch.commit()
    await writeAuditLog({
      tenantId: DEFAULT_TENANT_ID,
      actor: SYSTEM_ACTOR,
      entidade: 'competencias',
      entidadeId: `${ano}_${String(mes).padStart(2, '0')}`,
      acao: 'scheduler_batch_create',
      dadosAntes: null,
      dadosDepois: {
        mes,
        ano,
        criadas,
        ignoradas,
        totalServicosAtivos: servicosSnap.size,
      },
      origem: 'scheduler',
    })
    console.log(`[competencias] Criadas: ${criadas} | Ignoradas (já existiam ou inativo): ${ignoradas}`)
  }
)
