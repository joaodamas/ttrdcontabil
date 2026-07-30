import type { Timestamp } from 'firebase/firestore'

// Catálogo de produtos para NF-e (modelo 55) e NFC-e (modelo 65).
//
// A Spedy TRANSMITE mas NÃO calcula/determina imposto: a situação tributária
// (CST/CSOSN, se tem ST, base e valor de ST, IPI, alíquotas) é preenchida aqui
// pelo contador, uma vez por produto. A emissão reusa esta ficha e a converte
// no item enviado ao provedor. Cobre Simples (CSOSN) e regime normal (CST).
export type ProdutoRecord = Record<string, unknown> & {
  id: string
  clienteId: string          // empresa emissora (dona do produto)
  tenantId?: string
  codigo: string
  descricao: string
  ncm: string
  cfop?: string              // CFOP padrão (a operação pode sobrescrever)
  unidade: string            // ex.: "UN"
  origem?: string            // 0–8, origem da mercadoria (ICMS)
  valorUnitario?: number     // preço padrão (editável na emissão)

  // ── Ficha fiscal (o contador preenche conforme o regime do emissor) ──
  // ICMS
  icmsCst?: string           // regime normal
  icmsCsosn?: string         // Simples Nacional
  icmsAliquota?: number      // em %
  icmsStBaseRetencao?: number
  icmsStValorRetido?: number
  // IPI (indústria)
  ipiCst?: string
  ipiAliquota?: number
  // PIS / COFINS
  pisCst?: string
  pisAliquota?: number
  cofinsCst?: string
  cofinsAliquota?: number

  // ── Reforma Tributária (IBS/CBS/IS — LC 214/2025, NT 2025.002) ──
  // Homologação obrigatória desde 01/07/2026; produção obrigatória em
  // 03/08/2026 pra CRT 3 (Regime Normal). Simples Nacional/MEI: 2027.
  // CAMPOS AINDA NÃO TRANSMITIDOS: confirmado em 2026-07-29, via schema
  // público da Spedy (api.spedy.com.br/llms.txt), que o endpoint
  // `product-invoices` ainda não aceita IBS/CBS — só ICMS/PIS/COFINS. Esses
  // campos ficam guardados aqui pra quando o provedor liberar (ver
  // functions/src/nfse/provedores/spedy.ts) — NÃO acionam nada hoje.
  ibsCbsCst?: string          // CST da reforma — tabela própria (NT 2025.002), não reaproveita icmsCst
  cClassTrib?: string         // Código de Classificação Tributária — vinculado a artigo da LC 214/2025

  ativo?: boolean
  deletedAt?: Timestamp | null
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
}
