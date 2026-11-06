import { getFirestore } from 'firebase-admin/firestore'
import { IBGE_LEGADO, normalizarIbge, type ConfigFiscalCliente } from './types'
import {
  conectorLiberaProducao,
  DOC_NFSE_NACIONAL,
  producaoNacionalLiberada,
  resolverProvedorNfse,
  type OperacaoFiscal,
} from './provedor'

const db = () => getFirestore()

export async function isProducaoLiberadaPorConfigOuConector(
  config: ConfigFiscalCliente,
  operacao: OperacaoFiscal = 'emissao',
) {
  const provedor = resolverProvedorNfse(config)

  // Ambiente Nacional: a liberação de produção é a chave única do escritório
  // (configuracoes/nfse_nacional, ligada pelo admin) — não mais município a
  // município — e é SEMPRE exigida: o producaoLiberada da config do cliente
  // não a dispensa (só pode bloquear). Por isso este ramo vem ANTES do atalho
  // da config. A adesão de cada município é conferida pelo NacionalConector no
  // convênio, antes de enviar.
  if (provedor === 'nacional') {
    const chave = await db().collection('configuracoes').doc(DOC_NFSE_NACIONAL).get()
    return producaoNacionalLiberada(config, chave.exists ? chave.data() : null)
  }

  // Legado (webservice da prefeitura): comportamento anterior.
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

  return snap.docs.some((doc) => conectorLiberaProducao(doc.data() as Record<string, unknown>, operacao, provedor))
}
