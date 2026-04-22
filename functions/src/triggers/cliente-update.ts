/**
 * Trigger: propagação automática de razão social
 *
 * Dispara quando um documento em `clientes/{clienteId}` é atualizado.
 * Se o campo `razaoSocial` mudou, atualiza o campo `clienteNome` (ou similar)
 * nas coleções que desnormalizam o nome do cliente:
 *
 *   competencias    → clienteNome
 *   lancamentos     → clienteNome
 *   tarefas         → clienteNome
 *   nfse_emitidas   → clienteNome
 *   nfse_rascunhos  → clienteNome
 *   nfse_erros      → clienteNome
 *   clientes_fiscal → (não tem clienteNome — ignora)
 *   clientes_servicos → clienteNome (se existir)
 *
 * Cada coleção é atualizada em batch de 500. Usa WriteBatch por coleção.
 *
 * Nota: a propagação é eventual — não há transação global. Em caso de
 * falha parcial, a função reexecuta automaticamente pelo Firestore (retry).
 */
import * as admin from 'firebase-admin'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'

const db = () => admin.firestore()

// Coleções que armazenam clienteNome com referência a clienteId
const COLECOES_COM_NOME = [
  'competencias',
  'lancamentos',
  'tarefas',
  'nfse_emitidas',
  'nfse_rascunhos',
  'nfse_erros',
  'clientes_servicos',
] as const

async function propagarNome(clienteId: string, novoNome: string): Promise<void> {
  for (const colecao of COLECOES_COM_NOME) {
    const snap = await db()
      .collection(colecao)
      .where('clienteId', '==', clienteId)
      .get()

    if (snap.empty) continue

    // Divide em batches de 500
    const chunks: typeof snap.docs[] = []
    for (let i = 0; i < snap.docs.length; i += 500) {
      chunks.push(snap.docs.slice(i, i + 500))
    }

    for (const chunk of chunks) {
      const batch = db().batch()
      for (const doc of chunk) {
        batch.update(doc.ref, { clienteNome: novoNome })
      }
      await batch.commit()
    }

    console.log(`[cliente-update] ${colecao}: ${snap.size} doc(s) atualizados para clienteId=${clienteId}`)
  }
}

export const propagarRazaoSocial = onDocumentUpdated(
  {
    document: 'clientes/{clienteId}',
    region:   'southamerica-east1',
    memory:   '256MiB',
    timeoutSeconds: 300,
  },
  async (event) => {
    const before = event.data?.before?.data()
    const after  = event.data?.after?.data()

    if (!before || !after) return

    const razaoAntes   = before.razaoSocial as string | undefined
    const razaoDepois  = after.razaoSocial  as string | undefined

    // Sem mudança — sai imediatamente
    if (!razaoDepois || razaoAntes === razaoDepois) return

    const clienteId = event.params.clienteId
    console.log(`[cliente-update] razaoSocial mudou: "${razaoAntes}" → "${razaoDepois}" (clienteId=${clienteId})`)

    await propagarNome(clienteId, razaoDepois)
  }
)
