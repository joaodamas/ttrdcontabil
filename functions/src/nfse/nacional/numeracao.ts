/**
 * Numeração sequencial da DPS (Ambiente Nacional) — regras PURAS.
 *
 * O contador vive em `dps_sequencias/{cnpj}_{tpAmb}_{serie}` (só Admin SDK — as
 * firestore.rules negam o navegador) e é incrementado dentro da MESMA transação
 * que marca o rascunho como 'processando' (emitir.ts → processarEmissao). O
 * número fica gravado no rascunho antes do envio, então o retry reusa o mesmo
 * nDPS e a consulta prévia (GET /dps/{id}) encontra a nota se ela já saiu.
 *
 * tpAmb entra na chave: produção restrita e produção têm numerações
 * independentes (testar não pode "queimar" número de produção).
 */
export const SERIE_DPS_PADRAO = '1'
export const COLECAO_SEQUENCIAS_DPS = 'dps_sequencias'

const PADRAO_SERIE = /^([0-9]{1,4}|[0-8][0-9]{4})$/ // TSSerieDPS (XSD 1.01)
const PADRAO_NUMERO = /^[1-9][0-9]{0,14}$/ // TSNumDPS

export function serieDpsValida(serie: unknown): serie is string {
  return typeof serie === 'string' && PADRAO_SERIE.test(serie)
}

export function numeroDpsValido(numero: unknown): numero is string {
  return typeof numero === 'string' && PADRAO_NUMERO.test(numero)
}

/** Série da config (ou "1"). Série fora do padrão do XSD = erro de configuração. */
export function normalizarSerieDps(serie: unknown): string {
  const s = String(serie ?? '').trim()
  if (!s) return SERIE_DPS_PADRAO
  // "001" e "1" são a mesma série no Id da DPS (padStart 5) — guarda sem zeros.
  const semZeros = s.replace(/^0+(?=\d)/, '')
  if (!serieDpsValida(semZeros)) {
    throw new Error(`Série da DPS inválida ("${s}"): use de 1 a 5 dígitos (até 89999).`)
  }
  return semZeros
}

export function idSequenciaDps(cnpj: string, tpAmb: '1' | '2', serie: string): string {
  const doc = String(cnpj ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (doc.length !== 14 && doc.length !== 11) throw new Error('Numeração da DPS: CNPJ/CPF do prestador inválido.')
  if (tpAmb !== '1' && tpAmb !== '2') throw new Error('Numeração da DPS: tpAmb inválido.')
  if (!serieDpsValida(serie)) throw new Error('Numeração da DPS: série inválida.')
  return `${doc}_${tpAmb}_${serie}`
}

/** Próximo nDPS a partir do último gravado (ausente/inválido = começa em 1). */
export function proximoNumeroDps(ultimo: unknown): number {
  const n = typeof ultimo === 'number' && Number.isSafeInteger(ultimo) && ultimo > 0 ? ultimo : 0
  const proximo = n + 1
  if (String(proximo).length > 15) throw new Error('Numeração da DPS esgotada para esta série (15 dígitos).')
  return proximo
}

export interface DpsPersistida {
  numero?: unknown
  serie?: unknown
  provedor?: unknown
  tpAmb?: unknown
}

/**
 * O número já gravado no rascunho pode ser reusado nesta tentativa?
 * Só se for uma DPS NACIONAL do MESMO ambiente e série válidos. RPS municipal
 * antigo (série "RPS", número de Date.now()) ou DPS de outro ambiente → aloca
 * um número novo (é outro sistema/numeração; a consulta prévia do retry já
 * terá olhado o número antigo).
 */
export function podeReusarDps(existente: DpsPersistida, atual: { tpAmb: '1' | '2' }): boolean {
  return existente.provedor === 'nacional'
    && existente.tpAmb === atual.tpAmb
    && serieDpsValida(existente.serie)
    && numeroDpsValido(existente.numero)
}
