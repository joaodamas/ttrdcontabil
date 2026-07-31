/**
 * Endereço do tomador — montagem pura, sem Firestore.
 *
 * Existe por uma armadilha específica: `endereco` é gravado como MAPA aninhado
 * (é assim que TomadorEnderecoDoc foi definido, diferente de ClienteDoc, que
 * achata o endereço na raiz). O `stripUndefined` de createDocument/updateDocument
 * só varre a RAIZ do documento, então um `undefined` dentro do mapa chega no SDK
 * e derruba a gravação inteira com "Unsupported field value: undefined".
 */
import type { TomadorEnderecoDoc } from '@/types/firestore'

/**
 * Remove as chaves vazias do endereço. Devolve `undefined` quando não sobra
 * nada — endereço vazio não deve virar um mapa `{}` no documento.
 */
export function limparEndereco(
  parcial: Partial<Record<keyof TomadorEnderecoDoc, string | undefined>>,
): TomadorEnderecoDoc | undefined {
  const entradas = Object.entries(parcial).filter(([, valor]) => {
    return typeof valor === 'string' && valor.trim() !== ''
  }) as Array<[keyof TomadorEnderecoDoc, string]>

  if (entradas.length === 0) return undefined
  return Object.fromEntries(entradas.map(([k, v]) => [k, v.trim()])) as TomadorEnderecoDoc
}
