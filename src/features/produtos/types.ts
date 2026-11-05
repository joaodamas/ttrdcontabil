import type { Timestamp } from 'firebase/firestore'

// Catálogo de produtos para NF-e (modelo 55) e NFC-e (modelo 65).
//
// A situação tributária (CST/CSOSN, se tem ST, base e valor de ST, IPI,
// alíquotas) é preenchida aqui pelo contador, uma vez por produto. Cobre
// Simples (CSOSN) e regime normal (CST).
//
// A emissão de NF-e saiu em 2026-11-05 (só existia via Spedy, encerrada; a
// emissão é direta, sem integrador). O catálogo fica para não perder a ficha.
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
  // Prazo por MODELO de documento, não por data única — Ato Conjunto
  // RFB/CGIBS nº 4, de 30/07/2026:
  //   03/08/2026 → NF-e, NFC-e, CT-e, MDF-e (é o caso DESTE arquivo)
  //   01/10/2026 → NFS-e de serviços em geral
  //   01/12/2026 → NFS-e de plataformas e específicas, NF-e ABI/NFAg/NFGas
  //   01/01/2027 → tudo que for emitido por optante do Simples Nacional / MEI
  // Na carteira da TTRD isso significa: 96 dos 119 clientes (Simples) só em
  // 2027; dos 23 de Regime Normal, só quem emite produto está obrigado agora.
  //
  // ⚠️ cst/classification são inteiros nos leiautes fiscais; aqui é string por
  // histórico do cadastro — converter na origem ao construir a transmissão.
  ibsCbsCst?: string          // CST da reforma — tabela própria (NT 2025.002), não reaproveita icmsCst
  cClassTrib?: string         // Código de Classificação Tributária — vinculado a artigo da LC 214/2025

  ativo?: boolean
  deletedAt?: Timestamp | null
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
}
