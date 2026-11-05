import * as admin from 'firebase-admin'
import { IBGE_LEGADO, normalizarIbge, type ConfigFiscalCliente } from './types'
import {
  conectorLiberaProducao,
  DOC_NFSE_NACIONAL,
  nacionalLiberadoParaProducao,
  resolverProvedorNfse,
  type OperacaoFiscal,
} from './provedor'

const db = () => admin.firestore()

export async function isProducaoLiberadaPorConfigOuConector(
  config: ConfigFiscalCliente,
  operacao: OperacaoFiscal = 'emissao',
) {
  if (config.producaoLiberada === true) return true

  const provedor = resolverProvedorNfse(config)

  // Ambiente Nacional: a liberação de produção é a chave única do escritório
  // (configuracoes/nfse_nacional, ligada pelo admin) — não mais município a
  // município. A adesão de cada município é conferida pelo NacionalConector
  // no convênio, antes de enviar.
  if (provedor === 'nacional') {
    const chave = await db().collection('configuracoes').doc(DOC_NFSE_NACIONAL).get()
    return nacionalLiberadoParaProducao(chave.exists ? chave.data() : null)
  }

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

  return snap.docs.some((doc) => conectorLiberaProducao(doc.data() as Record<string, unknown>, operacao, provedor))
}
