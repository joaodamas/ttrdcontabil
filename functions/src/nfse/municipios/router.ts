/**
 * Roteador de municípios — mapeia código IBGE para o conector correto.
 *
 * Imports dinâmicos: evitam carregar node-forge/xml-crypto e todos os conectores
 * na análise do deploy do Firebase (timeout ~10s ao carregar o entrypoint).
 */
import type { CertificadoA1, ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'

// Municípios que exigem certificado A1
const IBGE_A1 = new Set(['3525904', '3509502', '3508900', '3550308', '3505708'])

export async function rotearEmissao(
  input:     EmitirNfseInput,
  config:    ConfigFiscalCliente,
  prestador: Prestador,
  cert?:     CertificadoA1,
): Promise<ResultadoEmissao> {
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

    case '3508900': { // Cajamar
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

    case '3552502': { // Taboão da Serra
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
