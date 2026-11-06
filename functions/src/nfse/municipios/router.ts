/**
 * Roteador de emissão. Provedor efetivo (provedor.ts → resolverProvedorNfse):
 *  - 'nacional' (padrão): NacionalConector (Sefin Nacional/ADN) para qualquer
 *    município; exige o A1 do prestador;
 *  - 'municipio' (legado): mapeia o código IBGE para o conector da prefeitura;
 *  - 'spedy': descontinuado.
 *
 * Imports dinâmicos: evitam carregar node-forge/xml-crypto e todos os conectores
 * na análise do deploy do Firebase (timeout ~10s ao carregar o entrypoint).
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
} from '../types'
import { normalizarIbge } from '../types'
import { resolverProvedorNfse } from '../provedor'
import type { OpcoesNacionalConector } from '../provedores/nacional'

/** Prestador com o IBGE corrigido (configs antigas guardam código errado — ver IBGE_LEGADO). */
function comIbgeCorreto(prestador: Prestador): Prestador {
  return { ...prestador, municipioIbge: normalizarIbge(prestador.municipioIbge) }
}

// Municípios que exigem certificado A1
const IBGE_A1 = new Set(['3525904', '3509502', '3509205', '3550308', '3505708'])

/** Rascunho de origem da nota — conectores que não usam simplesmente ignoram. */
export type ChaveProvedor = { rascunhoId?: string }

/**
 * Clientes ainda gravados com provedorNfse 'spedy' (conta encerrada em 2026-09):
 * falha com instrução clara em vez de erro de credencial de uma API que não existe.
 */
const PROVEDOR_DESCONTINUADO = {
  sucesso: false as const,
  codigoErro: 'PROVEDOR_DESCONTINUADO',
  erro: 'Este cliente ainda está configurado com a Spedy, que foi descontinuada. Em Clientes → Fiscal, abra e salve a configuração: o cliente passa a emitir pelo Ambiente Nacional.',
}

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

/** Ambiente Nacional (padrão): mesmo conector para todo município conveniado. */
async function carregarNacional() {
  const { NacionalConector } = await import('../provedores/nacional')
  return new NacionalConector(opcoesConectorNacional)
}
export type ConsultarNfseInputRoteado = ConsultarNfseInput & ChaveProvedor
export type CancelarNfseInputRoteado = CancelarNfseInput & ChaveProvedor

export async function rotearEmissao(
  input:     EmitirNfseInput,
  config:    ConfigFiscalCliente,
  prestador: Prestador,
  cert?:     CertificadoA1,
): Promise<ResultadoEmissao> {
  const provedor = resolverProvedorNfse(config)
  if (provedor === 'spedy') return PROVEDOR_DESCONTINUADO
  prestador = comIbgeCorreto(prestador)

  if (provedor === 'nacional') {
    if (!cert) return CERTIFICADO_NACIONAL_AUSENTE
    return (await carregarNacional()).emitir(input, config, cert, prestador)
  }

  // ── Legado: conector direto do webservice da prefeitura ─────────────────
  const ibge = prestador.municipioIbge

  // Valida certificado A1 para municípios que exigem
  if (IBGE_A1.has(ibge) && !cert) {
    return { sucesso: false, erro: 'Certificado A1 não encontrado. Faça o upload nas configurações fiscais do cliente.' }
  }

  switch (ibge) {
    // ── ABRASF ──────────────────────────────────────────────────────
    case '3525904': { // Jundiaí
      const { JundiaiConector } = await import('./jundiai')
      return new JundiaiConector().emitir(input, config, cert!, prestador)
    }

    case '3509502': { // Campinas
      const { CampinasConector } = await import('./campinas')
      return new CampinasConector().emitir(input, config, cert!, prestador)
    }

    case '3509205': { // Cajamar
      const { CajamarConector } = await import('./cajamar')
      return new CajamarConector().emitir(input, config, cert!, prestador)
    }

    // ── Proprietários com A1 ─────────────────────────────────────────
    case '3550308': { // São Paulo
      const { SaoPauloConector } = await import('./sao-paulo')
      return new SaoPauloConector().emitir(input, config, cert!, prestador)
    }

    case '3505708': { // Barueri
      const { BarueriConector } = await import('./barueri')
      return new BarueriConector().emitir(input, config, cert!, prestador)
    }

    // ── Token / REST ─────────────────────────────────────────────────
    case '3547304': { // Santana de Parnaíba
      const { SantanaParnaibhaConector } = await import('./santana-parnaiba')
      return new SantanaParnaibhaConector().emitir(input, config, prestador)
    }

    case '3552809': { // Taboão da Serra
      const { TaboaoSerraConector } = await import('./taboao-serra')
      return new TaboaoSerraConector().emitir(input, config, prestador)
    }

    case '3513009': { // Cotia
      const { CotiaConector } = await import('./cotia')
      return new CotiaConector().emitir(input, config, prestador)
    }

    default:
      return {
        sucesso: false,
        erro: `Município com código IBGE ${ibge} ainda não integrado. Entre em contato com o suporte.`,
      }
  }
}

type CicloConector = {
  consultar?: (
    input: ConsultarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ) => Promise<ResultadoOperacaoNfse>
  cancelar?: (
    input: CancelarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ) => Promise<ResultadoOperacaoNfse>
}

async function carregarConector(ibge: string): Promise<CicloConector | null> {
  switch (ibge) {
    case '3525904': {
      const { JundiaiConector } = await import('./jundiai')
      return new JundiaiConector()
    }
    case '3509502': {
      const { CampinasConector } = await import('./campinas')
      return new CampinasConector()
    }
    case '3509205': {
      const { CajamarConector } = await import('./cajamar')
      return new CajamarConector()
    }
    case '3550308': {
      const { SaoPauloConector } = await import('./sao-paulo')
      return new SaoPauloConector() as unknown as CicloConector
    }
    case '3505708': {
      const { BarueriConector } = await import('./barueri')
      return new BarueriConector() as unknown as CicloConector
    }
    case '3547304': {
      const { SantanaParnaibhaConector } = await import('./santana-parnaiba')
      return new SantanaParnaibhaConector() as unknown as CicloConector
    }
    case '3552809': {
      const { TaboaoSerraConector } = await import('./taboao-serra')
      return new TaboaoSerraConector() as unknown as CicloConector
    }
    case '3513009': {
      const { CotiaConector } = await import('./cotia')
      return new CotiaConector() as unknown as CicloConector
    }
    default:
      return null
  }
}

export async function rotearConsulta(
  input: ConsultarNfseInputRoteado,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  cert?: CertificadoA1,
): Promise<ResultadoOperacaoNfse> {
  const provedor = resolverProvedorNfse(config)
  if (provedor === 'spedy') return PROVEDOR_DESCONTINUADO
  prestador = comIbgeCorreto(prestador)
  if (provedor === 'nacional') {
    if (!cert) return CERTIFICADO_NACIONAL_AUSENTE
    return (await carregarNacional()).consultar(input, config, cert, prestador)
  }
  const conector = await carregarConector(prestador.municipioIbge)
  if (!conector) {
    return { sucesso: false, erro: `Município com código IBGE ${prestador.municipioIbge} ainda não integrado.` }
  }
  if (!conector.consultar) {
    return { sucesso: false, codigoErro: 'CONSULTA_NAO_IMPLEMENTADA', erro: 'Consulta real ainda não implementada para este município.' }
  }
  return conector.consultar(input, config, cert, prestador)
}

export async function rotearCancelamento(
  input: CancelarNfseInputRoteado,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  cert?: CertificadoA1,
): Promise<ResultadoOperacaoNfse> {
  const provedor = resolverProvedorNfse(config)
  if (provedor === 'spedy') return PROVEDOR_DESCONTINUADO
  prestador = comIbgeCorreto(prestador)
  if (provedor === 'nacional') {
    if (!cert) return CERTIFICADO_NACIONAL_AUSENTE
    return (await carregarNacional()).cancelar(input, config, cert, prestador)
  }
  const conector = await carregarConector(prestador.municipioIbge)
  if (!conector) {
    return { sucesso: false, erro: `Município com código IBGE ${prestador.municipioIbge} ainda não integrado.` }
  }
  if (!conector.cancelar) {
    return { sucesso: false, codigoErro: 'CANCELAMENTO_NAO_IMPLEMENTADO', erro: 'Cancelamento real ainda não implementado para este município.' }
  }
  return conector.cancelar(input, config, cert, prestador)
}
