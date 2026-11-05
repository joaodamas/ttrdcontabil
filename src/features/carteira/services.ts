import { limit, type Timestamp } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import {
  contratosVencendoEm,
  movimentoDoMes,
  rankearClientes,
  resumirCarteira,
  type ContratoCarteira,
  type ContratoVencendo,
  type ClienteNaCarteira,
  type MovimentoCarteira,
  type ResumoCarteira,
} from './calculo'

/** Documento cru de clientes_servicos, como o Firestore devolve. */
type ContratoDoc = {
  clienteId?: string
  clienteNome?: string | null
  servicoNome?: string | null
  valor?: number | null
  frequencia?: string | null
  status?: string | null
  dataInicio?: Timestamp | null
  dataFim?: Timestamp | null
}

export type CarteiraSnapshot = {
  resumo: ResumoCarteira
  ranking: ClienteNaCarteira[]
  vencendo30: ContratoVencendo[]
  vencendo90: ContratoVencendo[]
  movimento: MovimentoCarteira
  /** Quantos contratos foram lidos — usado para avisar quando bate o teto. */
  totalLido: number
  truncado: boolean
}

// Teto alto de propósito: a carteira inteira precisa ser lida para o MRR ser o
// MRR, e não a soma de uma página. Com 119 clientes e poucos contratos cada, a
// coleção fica muito abaixo disto — mas o teto existe para não varrer sem
// limite se alguém importar uma base grande, e `truncado` avisa na tela em vez
// de mentir em silêncio.
const TETO_CONTRATOS = 2000

export async function fetchCarteiraSnapshot(referencia = new Date()): Promise<CarteiraSnapshot> {
  const docs = await listDocuments<ContratoDoc>('clientes_servicos', [limit(TETO_CONTRATOS)])

  const contratos: ContratoCarteira[] = docs.map((d) => ({
    id: d.id,
    clienteId: d.clienteId ?? '',
    clienteNome: d.clienteNome ?? null,
    servicoNome: d.servicoNome ?? null,
    valor: d.valor ?? null,
    frequencia: d.frequencia ?? null,
    status: d.status ?? null,
    dataInicio: d.dataInicio?.toDate() ?? null,
    dataFim: d.dataFim?.toDate() ?? null,
  }))

  return {
    resumo: resumirCarteira(contratos, referencia),
    ranking: rankearClientes(contratos, referencia),
    vencendo30: contratosVencendoEm(contratos, referencia, 30),
    vencendo90: contratosVencendoEm(contratos, referencia, 90),
    movimento: movimentoDoMes(contratos, referencia),
    totalLido: contratos.length,
    truncado: contratos.length >= TETO_CONTRATOS,
  }
}
