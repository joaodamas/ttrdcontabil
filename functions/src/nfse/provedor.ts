/**
 * Regras puras de provedor de emissão (sem firebase-admin — testável no vitest).
 */
import type { ConfigFiscalCliente, ProvedorNfse } from './types'

export const PROVEDOR_PADRAO: ProvedorNfse = 'nacional'

/**
 * Provedor efetivo da config — decisão do dono (2026-11-05): emitir pelo
 * Ambiente Nacional, não pelas prefeituras. Só 'prefeitura' (escolha explícita
 * do conector legado) vai para o webservice municipal. 'municipio' gravado vem
 * do formulário antigo, que o punha em TODO cliente sem perguntar — conta como
 * Nacional. 'spedy' continua reconhecido para a mensagem de descontinuado.
 */
export function resolverProvedorNfse(config: Pick<ConfigFiscalCliente, 'provedorNfse'> | null | undefined): ProvedorNfse {
  const p = config?.provedorNfse
  if (p === 'prefeitura') return 'municipio'
  if (p === 'spedy') return 'spedy'
  return PROVEDOR_PADRAO
}

export type OperacaoFiscal = 'emissao' | 'consulta' | 'cancelamento'

/**
 * Um documento de `fiscal_conectores` libera produção para a operação?
 *
 * O documento é por município; o campo `provedor` diz QUAL caminho foi
 * homologado ('municipio' quando ausente — todos os docs anteriores a
 * 2026-11-05 homologaram o webservice da prefeitura). Homologar o conector da
 * prefeitura não libera o Ambiente Nacional, e vice-versa.
 */
export function conectorLiberaProducao(
  conector: Record<string, unknown>,
  operacao: OperacaoFiscal,
  provedor: ProvedorNfse,
): boolean {
  const provedorDoc = conector.provedor === 'nacional' ? 'nacional' : 'municipio'
  return provedorDoc === provedor
    && conector.ativo !== false
    && conector.homologado === true
    && conector.producaoLiberada === true
    && conector[operacao] === true
}
