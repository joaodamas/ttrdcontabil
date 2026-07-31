import type { TomadorDoc, TomadorEnderecoDoc, WithId } from '@/types/firestore'

/** Documento de `tomadores` como a tela lê (já com o id). */
export type TomadorRecord = WithId<TomadorDoc>

/**
 * O PRESTADOR: o cliente do escritório dono da carteira. Só estes campos
 * importam para a tela — o documento é o que a validação compara contra o
 * tomador, e o nome é o que aparece no cabeçalho.
 */
export interface PrestadorResumo {
  id: string
  razaoSocial: string
  /** Só dígitos, igual ao que a validação compara. */
  cpfCnpj: string
}

/**
 * Valores que o formulário entrega ao service. `cpfCnpj` chega mascarado da
 * tela e é normalizado para dígitos na gravação — as regras do Firestore
 * recusam qualquer coisa fora de `^[0-9]{11}$|^[0-9]{14}$`.
 */
export interface TomadorInput {
  cpfCnpj: string
  razaoSocial: string
  email?: string
  telefone?: string
  inscricaoMunicipal?: string
  endereco?: TomadorEnderecoDoc
  ativo: boolean
}
