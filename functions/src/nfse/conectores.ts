import * as admin from 'firebase-admin'
import { IBGE_LEGADO, normalizarIbge, type ConfigFiscalCliente } from './types'
import { conectorLiberaProducao, resolverProvedorNfse, type OperacaoFiscal } from './provedor'

const db = () => admin.firestore()

export async function isProducaoLiberadaPorConfigOuConector(
  config: ConfigFiscalCliente,
  operacao: OperacaoFiscal = 'emissao',
) {
  if (config.producaoLiberada === true) return true
  if (!config.municipioIbge) return false

  // Conector e config podem estar com o código antigo ou o corrigido (IBGE_LEGADO).
  const ibge = normalizarIbge(config.municipioIbge)
  const legados = Object.keys(IBGE_LEGADO).filter((antigo) => IBGE_LEGADO[antigo] === ibge)
  // Sem limit(1): o mesmo município pode ter um doc do conector da prefeitura e
  // outro do Ambiente Nacional — só vale o do provedor configurado.
  const snap = await db().collection('fiscal_conectores')
    .where('municipioIbge', 'in', [ibge, ...legados])
    .limit(10)
    .get()

  if (snap.empty) return false

  const provedor = resolverProvedorNfse(config)
  return snap.docs.some((doc) => conectorLiberaProducao(doc.data() as Record<string, unknown>, operacao, provedor))
}
