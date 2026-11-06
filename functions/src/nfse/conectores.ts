import { getFirestore } from 'firebase-admin/firestore'
import type { ConfigFiscalCliente } from './types'
import { DOC_NFSE_NACIONAL, producaoNacionalLiberada, type OperacaoFiscal } from './provedor'

const db = () => getFirestore()

/**
 * Produção pelo Ambiente Nacional liberada para o cliente: a chave única do
 * escritório (configuracoes/nfse_nacional, ligada pelo admin) é SEMPRE
 * exigida — o producaoLiberada da config do cliente não a dispensa (só pode
 * bloquear). A adesão de cada município é conferida pelo NacionalConector no
 * convênio, antes de enviar. `fiscal_conectores` (liberação por município do
 * conector da prefeitura) não vale mais nada desde 2026-11-06.
 */
export async function isProducaoLiberadaPorConfigOuConector(
  config: ConfigFiscalCliente,
  _operacao: OperacaoFiscal = 'emissao',
) {
  void _operacao
  const chave = await db().collection('configuracoes').doc(DOC_NFSE_NACIONAL).get()
  return producaoNacionalLiberada(config, chave.exists ? chave.data() : null)
}
