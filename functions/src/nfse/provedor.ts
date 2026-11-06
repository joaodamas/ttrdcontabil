/**
 * Regras puras de provedor de emissão (sem firebase-admin — testável no vitest).
 */
import type { ConfigFiscalCliente, ProvedorNfse } from './types'

export const PROVEDOR_PADRAO: ProvedorNfse = 'nacional'

/**
 * Provedor efetivo da config — decisão do dono (2026-11-05): emitir pelo
 * Ambiente Nacional, não pelas prefeituras. Só 'prefeitura' (escolha explícita
 * do conector legado) vai para o webservice municipal. 'municipio' gravado vem
 * do formulário antigo, que o punha em TODO cliente sem perguntar, e 'spedy'
 * vem da conta encerrada — ambos contam como Nacional.
 */
export function resolverProvedorNfse(config: Pick<ConfigFiscalCliente, 'provedorNfse'> | null | undefined): ProvedorNfse {
  // Spedy (descontinuada) também cai no Nacional: o cliente não precisa reabrir
  // e salvar a configuração para voltar a emitir.
  return config?.provedorNfse === 'prefeitura' ? 'municipio' : PROVEDOR_PADRAO
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

/** Documento `configuracoes/nfse_nacional`: chave única do Ambiente Nacional. */
export const DOC_NFSE_NACIONAL = 'nfse_nacional'

/**
 * Emissão em PRODUÇÃO pelo Ambiente Nacional liberada? Uma chave única do
 * escritório (opção A do dono, 2026-11-05) no lugar da liberação município a
 * município: a API é uma só e foi homologada de ponta a ponta; quem diz se o
 * município aceita é o convênio, consultado pelo NacionalConector. A chave
 * continua sendo um interruptor geral — desligada, nada sai em produção.
 */
export function nacionalLiberadoParaProducao(doc: { producaoLiberada?: unknown } | null | undefined): boolean {
  return doc?.producaoLiberada === true
}

/**
 * Produção pelo Ambiente Nacional liberada para ESTE cliente? A chave global
 * (configuracoes/nfse_nacional.producaoLiberada) é SEMPRE obrigatória — o
 * `producaoLiberada` da config do cliente não a dispensa (antes, `true` na
 * config passava por cima do interruptor geral). A config só pode restringir:
 * `producaoLiberada: false` explícito bloqueia aquele cliente.
 */
export function producaoNacionalLiberada(
  config: { producaoLiberada?: unknown } | null | undefined,
  docGlobal: { producaoLiberada?: unknown } | null | undefined,
): boolean {
  return nacionalLiberadoParaProducao(docGlobal) && config?.producaoLiberada !== false
}
