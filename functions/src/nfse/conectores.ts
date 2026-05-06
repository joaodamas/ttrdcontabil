import * as admin from 'firebase-admin'
import type { ConfigFiscalCliente } from './types'

const db = () => admin.firestore()

type OperacaoFiscal = 'emissao' | 'consulta' | 'cancelamento'

export async function isProducaoLiberadaPorConfigOuConector(
  config: ConfigFiscalCliente,
  operacao: OperacaoFiscal = 'emissao',
) {
  if (config.producaoLiberada === true) return true
  if (!config.municipioIbge) return false

  const snap = await db().collection('fiscal_conectores')
    .where('municipioIbge', '==', config.municipioIbge)
    .limit(1)
    .get()

  if (snap.empty) return false

  const conector = snap.docs[0].data() as Record<string, unknown>
  return conector.ativo !== false
    && conector.homologado === true
    && conector.producaoLiberada === true
    && conector[operacao] === true
}
