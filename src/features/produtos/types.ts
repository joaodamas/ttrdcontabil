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

  ativo?: boolean
  deletedAt?: Timestamp | null
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
}
