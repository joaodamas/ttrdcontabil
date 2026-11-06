/**
 * Validação do payload fiscal — hoje um atalho para o motor único de
 * pré-validação (./pre-validacao), que também roda no navegador. Devolve só as
 * mensagens dos BLOQUEIOS (avisos não impedem a emissão).
 */
import type { ConfigFiscalCliente, EmitirNfseInput, Prestador } from './types'
import { bloqueiosDe, hojeBrasilia, preValidarNfse, type AchadoFiscal } from './pre-validacao'

export function preValidarPayload(
  input: EmitirNfseInput,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  agora: Date = new Date(),
): AchadoFiscal[] {
  return preValidarNfse({
    nota: { tomador: input.tomador, servico: input.servico, dataCompetencia: input.dataCompetencia },
    config,
    prestador,
    hoje: hojeBrasilia(agora),
  })
}

export function validarPayloadFiscal(
  input: EmitirNfseInput,
  config: ConfigFiscalCliente,
  prestador: Prestador,
): string[] {
  const erros: string[] = []
  if (!input.clienteId) erros.push('clienteId obrigatório.')
  return [...erros, ...bloqueiosDe(preValidarPayload(input, config, prestador)).map((a) => a.mensagem)]
}
