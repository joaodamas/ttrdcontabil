import * as admin from 'firebase-admin'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { Timestamp } from 'firebase-admin/firestore'

const db = () => admin.firestore()

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

    const pendencias = await db()
      .collection('tarefas')
      .where('competenciaId', '==', competenciaId)
      .where('status', 'in', ['pendente', 'em_andamento'])
      .limit(1)
      .get()

    if (!pendencias.empty) {
      console.log(`[tarefa-concluida] competencia=${competenciaId} ainda possui tarefas pendentes`)
      return
    }

    await db().collection('competencias').doc(competenciaId).set(
      {
        status: 'concluida',
        dataConclusao: Timestamp.now(),
        atualizadoEm: Timestamp.now(),
      },
      { merge: true }
    )

    console.log(`[tarefa-concluida] competencia=${competenciaId} concluída automaticamente`)
  }
)
