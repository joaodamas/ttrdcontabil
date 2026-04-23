/**
 * Scheduler: criação automática de competências
 *
 * Executa todo dia 1º às 01:00 BRT (04:00 UTC).
 * Para cada cliente ativo com pelo menos um serviço ativo, cria um documento
 * de competência no mês corrente caso ainda não exista.
 *
 * Coleções envolvidas:
 *   clientes          — razaoSocial, status
 *   clientes_servicos — clienteId, status ('ativo'), valor, descricaoServico
 *   competencias      — documento criado aqui
 */
import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'

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
      .get()

    if (servicosSnap.empty) {
      console.log('[competencias] Nenhum serviço ativo encontrado.')
      return
    }

    // 2. Agrupa serviços por clienteId
    const porCliente = new Map<string, Array<{ id: string; descricao: string; valor: number }>>()
    for (const doc of servicosSnap.docs) {
      const d = doc.data()
      const cid = d.clienteId as string
      if (!porCliente.has(cid)) porCliente.set(cid, [])
      porCliente.get(cid)!.push({
        id:       doc.id,
        descricao: (d.descricaoServico ?? d.nomeServico ?? d.descricao ?? '') as string,
        valor:    (d.valor ?? 0) as number,
      })
    }

    // 3. Para cada cliente, verifica se a competência já existe antes de criar
    let batch    = db().batch()
    let batchOps = 0
    let criadas  = 0
    let ignoradas = 0

    for (const [clienteId, servicos] of porCliente.entries()) {
      // Checa se já existe competência para este cliente/mês/ano
      const jaExiste = await db()
        .collection('competencias')
        .where('clienteId', '==', clienteId)
        .where('mes', '==', mes)
        .where('ano', '==', ano)
        .limit(1)
        .get()

      if (!jaExiste.empty) {
        ignoradas++
        continue
      }

      // Busca razaoSocial do cliente
      const clienteDoc = await db().collection('clientes').doc(clienteId).get()
      if (!clienteDoc.exists || clienteDoc.data()?.status === 'inativo') {
        ignoradas++
        continue
      }

      const razaoSocial = (clienteDoc.data()?.razaoSocial ?? '') as string
      const valorTotal  = servicos.reduce((sum, s) => sum + s.valor, 0)

      const ref = db().collection('competencias').doc()
      batch.set(ref, {
        clienteId,
        clienteNome:   razaoSocial,
        mes,
        ano,
        competencia:   `${String(mes).padStart(2, '0')}/${ano}`,
        status:        'pendente',
        valorTotal,
        servicosIds:   servicos.map((s) => s.id),
        servicosNomes: servicos.map((s) => s.descricao),
        observacoes:   '',
        criadoEm:      Timestamp.now(),
        criadoAutomaticamente: true,
      })
      criadas++
      batchOps++

      // Firestore batch limit is 500 — commit and start a fresh batch
      if (batchOps === 400) {
        await batch.commit()
        batch    = db().batch()
        batchOps = 0
      }
    }

    if (batchOps > 0) await batch.commit()
    console.log(`[competencias] Criadas: ${criadas} | Ignoradas (já existiam ou inativo): ${ignoradas}`)
  }
)
