import * as admin from 'firebase-admin'
import { IBGE_LEGADO, normalizarIbge, type ConfigFiscalCliente } from './types'

const db = () => admin.firestore()

type OperacaoFiscal = 'emissao' | 'consulta' | 'cancelamento'

export async function isProducaoLiberadaPorConfigOuConector(
  config: ConfigFiscalCliente,
  operacao: OperacaoFiscal = 'emissao',
) {
  if (config.producaoLiberada === true) return true
  if (!config.municipioIbge) return false

  // Conector e config podem estar com o código antigo ou o corrigido (IBGE_LEGADO).
  const ibge = normalizarIbge(config.municipioIbge)
  const legados = Object.keys(IBGE_LEGADO).filter((antigo) => IBGE_LEGADO[antigo] === ibge)
  const snap = await db().collection('fiscal_conectores')
    .where('municipioIbge', 'in', [ibge, ...legados])
    .limit(1)
    .get()

  if (snap.empty) return false

  const conector = snap.docs[0].data() as Record<string, unknown>
  return conector.ativo !== false
    && conector.homologado === true
    && conector.producaoLiberada === true
    && conector[operacao] === true
}
