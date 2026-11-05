/**
 * Validação do contrato de emissão recorrente — lógica pura, sem Firestore.
 *
 * Espelha `nfseRecorrentePayloadValido()` do firestore.rules: sem isso o
 * contador recebe `permission-denied` (mensagem que não diz o que corrigir) em
 * vez de "o valor precisa ser maior que zero". Cada regra abaixo existe porque a
 * ausência dela quebra em silêncio:
 * - valor 0/negativo vira nota rejeitada na prefeitura;
 * - `diaEmissao` fora de 1–31 é contrato que nunca fatura;
 * - vigência invertida (fim antes do início) é contrato morto no nascimento.
 */

/** Limite de `descricao` no firestore.rules. Estourar aqui = write negado. */
export const MAX_DESCRICAO = 2000

export interface EntradaValidacaoContrato {
  tomadorId?: string | null
  descricao?: string | null
  valor?: number | null
  diaEmissao?: number | null
  dataInicio?: Date | null
  dataFim?: Date | null
  aliquota?: number | null
}

export function validarContratoRecorrente(entrada: EntradaValidacaoContrato): string[] {
  const erros: string[] = []

  if (!entrada.tomadorId) {
    // Contrato sem tomador reabre exatamente o buraco que fazia a nota sair com
    // prestador == tomador.
    erros.push('Selecione o tomador que recebe esta nota.')
  }

  const descricao = (entrada.descricao ?? '').trim()
  if (!descricao) erros.push('A descrição do serviço é obrigatória — é o texto que sai na nota.')
  else if (descricao.length > MAX_DESCRICAO) erros.push(`A descrição passa de ${MAX_DESCRICAO} caracteres.`)

  const valor = entrada.valor
  if (valor == null || !Number.isFinite(valor) || valor <= 0) {
    erros.push('O valor precisa ser um número maior que zero.')
  }

  const dia = entrada.diaEmissao
  if (dia == null || !Number.isInteger(dia) || dia < 1 || dia > 31) {
    erros.push('O dia de emissão precisa ser um número inteiro entre 1 e 31.')
  }

  if (!entrada.dataInicio) {
    erros.push('A data de início da vigência é obrigatória.')
  } else if (entrada.dataFim && entrada.dataFim < entrada.dataInicio) {
    erros.push('A data de fim não pode ser anterior à data de início.')
  }

  const aliquota = entrada.aliquota
  if (aliquota != null && (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100)) {
    erros.push('A alíquota, quando informada, vai de 0 a 100 (em %).')
  }

  return erros
}
