/**
 * Trigger: clientes_credenciais/{clienteId} → clientes/{clienteId}.credenciaisPreenchidas
 *
 * Quem não pode ler as senhas (operacional, financeiro, leitura) ainda precisa
 * ver na ficha e no relatório se cada uma está preenchida. O trigger grava em
 * `clientes` só a lista de NOMES dos campos com valor — nunca o valor. É o único
 * escritor desse campo (as regras negam ao navegador), então o fiscal, que
 * salva senha mas não edita `clientes`, também mantém o status em dia.
 */
import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { camposPreenchidos } from './credenciais-campos'

export const sincronizarCredenciaisPreenchidas = onDocumentWritten(
  { document: 'clientes_credenciais/{clienteId}', region: 'southamerica-east1' },
  async (event) => {
    const clienteRef = getFirestore().collection('clientes').doc(event.params.clienteId)
    const depois = event.data?.after
    const lista = depois?.exists ? camposPreenchidos(depois.data()) : []

    const cliente = await clienteRef.get()
    if (!cliente.exists) return
    const atual = cliente.get('credenciaisPreenchidas')
    if (Array.isArray(atual) && JSON.stringify(atual) === JSON.stringify(lista)) return
    await clienteRef.update({ credenciaisPreenchidas: lista })
  },
)
