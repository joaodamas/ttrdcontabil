/**
 * Roteador da emissão: SÓ o Ambiente Nacional (Sefin Nacional/ADN), com o A1
 * do próprio prestador, para qualquer município conveniado. Sem integrador e
 * sem conector de prefeitura — decisão do dono; os conectores municipais
 * (antes em ./municipios) saíram em 2026-11-06.
 *
 * Import dinâmico: evita carregar node-forge/xml-crypto na análise do deploy
 * do Firebase (timeout ~10s ao carregar o entrypoint).
 */
import type {
  CancelarNfseInput,
  CertificadoA1,
  ConfigFiscalCliente,
  ConsultarNfseInput,
  EmitirNfseInput,
  Prestador,
  ResultadoEmissao,
  ResultadoOperacaoNfse,
} from './types'
import { normalizarIbge } from './types'
import type { OpcoesNacionalConector } from './provedores/nacional'

/** Prestador com o IBGE corrigido (configs antigas guardam código errado — ver IBGE_LEGADO). */
function comIbgeCorreto(prestador: Prestador): Prestador {
  return { ...prestador, municipioIbge: normalizarIbge(prestador.municipioIbge) }
}

/** Rascunho de origem da nota (o NacionalConector usa na consulta da DPS). */
export type ChaveProvedor = { rascunhoId?: string }

const CERTIFICADO_NACIONAL_AUSENTE = {
  sucesso: false as const,
  codigoErro: 'CERTIFICADO_AUSENTE',
  erro: 'Certificado A1 não encontrado. O Ambiente Nacional exige o A1 do próprio cliente — faça o upload na configuração fiscal.',
}

let opcoesConectorNacional: OpcoesNacionalConector | undefined

/**
 * SÓ TESTES: injeta transporte/relógio no NacionalConector usado pelo roteador
 * (testes de orquestração de emitir/retry/consultar/lote sem rede).
 * `undefined` volta ao transporte mTLS real.
 */
export function definirOpcoesConectorNacional(opcoes: OpcoesNacionalConector | undefined): void {
  opcoesConectorNacional = opcoes
}

async function carregarNacional() {
  const { NacionalConector } = await import('./provedores/nacional')
  return new NacionalConector(opcoesConectorNacional)
}

export type ConsultarNfseInputRoteado = ConsultarNfseInput & ChaveProvedor
export type CancelarNfseInputRoteado = CancelarNfseInput & ChaveProvedor

export async function rotearEmissao(
  input: EmitirNfseInput,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  cert?: CertificadoA1,
): Promise<ResultadoEmissao> {
  if (!cert) return CERTIFICADO_NACIONAL_AUSENTE
  return (await carregarNacional()).emitir(input, config, cert, comIbgeCorreto(prestador))
}

export async function rotearConsulta(
  input: ConsultarNfseInputRoteado,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  cert?: CertificadoA1,
): Promise<ResultadoOperacaoNfse> {
  if (!cert) return CERTIFICADO_NACIONAL_AUSENTE
  return (await carregarNacional()).consultar(input, config, cert, comIbgeCorreto(prestador))
}

export async function rotearCancelamento(
  input: CancelarNfseInputRoteado,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  cert?: CertificadoA1,
): Promise<ResultadoOperacaoNfse> {
  if (!cert) return CERTIFICADO_NACIONAL_AUSENTE
  return (await carregarNacional()).cancelar(input, config, cert, comIbgeCorreto(prestador))
}
