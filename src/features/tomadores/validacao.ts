/**
 * Validação da carteira de tomadores — lógica pura, sem Firestore.
 *
 * Mora separada porque a regra central do módulo é uma comparação de dois
 * documentos, e é a regra que originou todo este trabalho: o gerador de
 * rascunhos preenchia o tomador com o próprio prestador
 * (functions/src/nfse/rascunhos.ts) e a nota recorrente saía do cliente para
 * ele mesmo — inválida em qualquer prefeitura. Regra que já virou bug em
 * produção merece teste, não confiança.
 *
 * As validações espelham `tomadorPayloadValido()` do firestore.rules de
 * propósito: sem elas o usuário recebe `permission-denied` — mensagem que não
 * diz o que corrigir — em vez de saber qual campo está errado.
 */
import { validateCpf, validateCnpj } from '@/lib/utils'

/** Limite de `razaoSocial` no firestore.rules. Estourar aqui = write negado. */
export const MAX_RAZAO_SOCIAL = 200

export const ERRO_TOMADOR_IGUAL_PRESTADOR =
  'O tomador não pode ser o próprio cliente. A nota sai DELE (prestador) para quem contratou o serviço — informe o CPF/CNPJ do cliente dele.'

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '')
}

/** CPF (11 dígitos) ou CNPJ (14) com dígito verificador correto. */
export function documentoValido(valor: string | null | undefined): boolean {
  const digits = somenteDigitos(valor)
  if (digits.length === 11) return validateCpf(digits)
  if (digits.length === 14) return validateCnpj(digits)
  return false
}

/** Mesmo formato "só dígitos" que o Firestore guarda — máscara não conta. */
export function mesmoDocumento(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = somenteDigitos(a)
  const db = somenteDigitos(b)
  return da.length > 0 && da === db
}

export function emailValido(valor: string | null | undefined): boolean {
  if (!valor) return true // e-mail é opcional; vazio não é erro
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
}

/** Código IBGE de município tem exatamente 7 dígitos. */
export function ibgeValido(valor: string | null | undefined): boolean {
  if (!valor) return true // opcional no cadastro; a emissão é quem cobra
  return /^\d{7}$/.test(somenteDigitos(valor))
}

export interface EntradaValidacaoTomador {
  cpfCnpj?: string | null
  razaoSocial?: string | null
  email?: string | null
  /** Código IBGE digitado/autopreenchido, quando houver. */
  municipioIbge?: string | null
  /** Documento do PRESTADOR (o cliente do escritório dono da carteira). */
  prestadorCpfCnpj?: string | null
  /**
   * Documento (só dígitos) → id do tomador já cadastrado NESTA carteira. Serve
   * para recusar o mesmo CNPJ duas vezes: duplicata na carteira faz o contador
   * faturar pelo cadastro errado e nunca entender por que o e-mail da nota
   * chegou no lugar errado.
   */
  documentosDaCarteira?: ReadonlyMap<string, string>
  /** Id do tomador em edição — ele próprio não conta como duplicata. */
  idAtual?: string | null
}

/**
 * Devolve a lista de erros legíveis. Vazia = pode gravar.
 *
 * Ordem importa: o erro de prestador == tomador vem antes do de duplicata
 * porque é o mais grave e o mais confuso de diagnosticar depois.
 */
export function validarTomador(entrada: EntradaValidacaoTomador): string[] {
  const erros: string[] = []
  const digits = somenteDigitos(entrada.cpfCnpj)
  const razaoSocial = (entrada.razaoSocial ?? '').trim()

  if (!razaoSocial) {
    erros.push('Nome / razão social do tomador é obrigatório.')
  } else if (razaoSocial.length > MAX_RAZAO_SOCIAL) {
    erros.push(`Nome / razão social passa de ${MAX_RAZAO_SOCIAL} caracteres.`)
  }

  if (!digits) {
    erros.push('CPF/CNPJ do tomador é obrigatório — sem ele não existe nota em prefeitura nenhuma.')
  } else if (!documentoValido(digits)) {
    erros.push('CPF/CNPJ do tomador inválido — confira os dígitos.')
  } else {
    if (mesmoDocumento(digits, entrada.prestadorCpfCnpj)) {
      erros.push(ERRO_TOMADOR_IGUAL_PRESTADOR)
    }
    const jaExiste = entrada.documentosDaCarteira?.get(digits)
    if (jaExiste && jaExiste !== entrada.idAtual) {
      erros.push('Este CPF/CNPJ já está na carteira deste cliente.')
    }
  }

  if (!emailValido(entrada.email)) erros.push('E-mail do tomador inválido.')
  if (!ibgeValido(entrada.municipioIbge)) erros.push('Código IBGE do município precisa ter 7 dígitos.')

  return erros
}
