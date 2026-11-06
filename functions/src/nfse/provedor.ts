/**
 * Regras puras de liberação de produção (sem firebase-admin — testável no vitest).
 *
 * Emissão SÓ pelo Ambiente Nacional (decisão do dono): o conector municipal
 * (webservice de cada prefeitura) e a Spedy saíram do código em 2026-11-06.
 * Configs antigas com `provedorNfse` 'municipio', 'prefeitura' ou 'spedy'
 * emitem pelo Nacional como todas as outras; a pré-validação barra, com
 * mensagem clara, o cliente cujo município não emite pelo Emissor Nacional
 * (E0037) e o que não tem certificado A1 (E0714).
 */

export type OperacaoFiscal = 'emissao' | 'consulta' | 'cancelamento'

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
