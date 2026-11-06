import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { decidirConclusaoAutomatica } from './competencia-auto'

const db = () => getFirestore()

export const onTarefaConcluida = onDocumentUpdated(
  {
    document: 'tarefas/{tarefaId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return

    const statusAntes = before.status as string | undefined
    const statusDepois = after.status as string | undefined
    if (statusAntes === statusDepois || statusDepois !== 'concluida') return

    const competenciaId = (after.competenciaId as string | undefined)?.trim()
    if (!competenciaId) {
      console.log(`[tarefa-concluida] tarefa=${event.params.tarefaId} sem competenciaId, sem ação`)
      return
    }

    const ref = db().collection('competencias').doc(competenciaId)
    // Transação: o status da competência e as pendências são lidos no mesmo
    // instante da escrita — duas tarefas concluídas juntas, ou alguém
    // cancelando a competência no meio, não viram uma conclusão indevida.
    const resultado = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const decisao = decidirConclusaoAutomatica({ existe: snap.exists, status: snap.get('status') })
      if (!decisao.concluir) return decisao.motivo

      const pendencias = await tx.get(
        db()
          .collection('tarefas')
          .where('competenciaId', '==', competenciaId)
          .where('status', 'in', ['pendente', 'em_andamento'])
          .limit(1),
      )
      if (!pendencias.empty) return 'tarefas_pendentes'

      const agora = Timestamp.now()
      // update (não set/merge): competência apagada não renasce como documento
      // só com status/datas.
      tx.update(ref, { status: 'concluida', dataConclusao: agora, atualizadoEm: agora })
      return 'concluida'
    })

    console.log(`[tarefa-concluida] competencia=${competenciaId} resultado=${resultado}`)
  }
)
