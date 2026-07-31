import type { NfseRecorrenteDoc, WithId } from '@/types/firestore'

/** Documento de `nfse_recorrentes` como a tela lê (já com o id). */
export type NfseRecorrenteRecord = WithId<NfseRecorrenteDoc>

/**
 * Valores que o formulário entrega ao service.
 *
 * As datas trafegam como `Date` e viram Timestamp só na gravação: o formulário
 * usa `<input type="date">`, e converter no meio do caminho é o que faz
 * contrato nascer com um dia de diferença por causa de fuso.
 */
export interface NfseRecorrenteInput {
  tomadorId: string
  descricao: string
  valor: number
  diaEmissao: number
  dataInicio: Date
  dataFim?: Date | null
  /** Vazios herdam de `clientes_fiscal` na emissão — ver NfseRecorrenteDoc. */
  itemListaServico?: string
  codigoServico?: string
  aliquota?: number | null
  issRetido: boolean
  ativo: boolean
}
