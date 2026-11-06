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

const inteiroPositivo = (v: unknown): number =>
  (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0)

/**
 * Próximo nDPS a partir do último gravado (ausente/inválido = começa em 1).
 * `piso` = "próximo número" informado na configuração fiscal (o cliente já
 * emitiu pelo Emissor Nacional web/app na mesma série): o contador nunca
 * entrega número abaixo dele — nem depois de um contador perdido/restaurado.
 */
export function proximoNumeroDps(ultimo: unknown, piso?: unknown): number {
  const proximo = Math.max(inteiroPositivo(ultimo) + 1, inteiroPositivo(piso))
  if (String(proximo).length > 15) throw new Error('Numeração da DPS esgotada para esta série (15 dígitos).')
  return proximo
}

/** Ajuste de numeração gravado na config fiscal pelo callable definirNumeracaoDps. */
export interface AjusteNumeracaoDps {
  serie?: unknown
  tpAmb?: unknown
}

/**
 * Piso da numeração que vale para ESTE contador (série + ambiente): só o
 * `proximoNumeroDps` da config, e só se foi definido para a mesma série e o
 * mesmo ambiente (informar o número da produção não mexe na homologação).
 */
export function pisoNumeracaoDps(
  config: { proximoNumeroDps?: unknown; numeracaoDpsAjuste?: AjusteNumeracaoDps | null },
  serie: string,
  tpAmb: '1' | '2',
): number | undefined {
  const piso = inteiroPositivo(config.proximoNumeroDps)
  const ajuste = config.numeracaoDpsAjuste
  if (!piso || !ajuste || ajuste.serie !== serie || ajuste.tpAmb !== tpAmb) return undefined
  return piso
}

/**
 * Validação do "próximo número da DPS" informado por admin/fiscal: inteiro de
 * 1 a 15 dígitos e NUNCA menor ou igual ao último já usado pela plataforma
 * nesta série (voltar repetiria nDPS — E0014 ou, pior, nota em dobro na
 * consulta prévia). Devolve a mensagem de erro, ou null.
 */
export function validarProximoNumeroDps(proximo: unknown, ultimoUsado: unknown): string | null {
  if (typeof proximo !== 'number' || !Number.isSafeInteger(proximo) || proximo < 1 || String(proximo).length > 15) {
    return 'Informe o próximo número da DPS como um número inteiro de 1 a 15 dígitos.'
  }
  const ultimo = inteiroPositivo(ultimoUsado)
  if (proximo <= ultimo) {
    return `A plataforma já usou a DPS nº ${ultimo} nesta série — o próximo número precisa ser ${ultimo + 1} ou maior (a numeração só avança).`
  }
  return null
}

/**
 * Último número do contador depois de uma colisão E0014 no nº `colidido`:
 * pelo menos o colidido, para a próxima emissão não repeti-lo.
 */
export function ultimoAposColisao(ultimo: unknown, colidido: unknown): number {
  const c = typeof colidido === 'string' && numeroDpsValido(colidido) ? Number(colidido) : inteiroPositivo(colidido)
  return Math.max(inteiroPositivo(ultimo), Number.isSafeInteger(c) ? c : 0)
}

export interface DpsPersistida {
  numero?: unknown
  serie?: unknown
  provedor?: unknown
  tpAmb?: unknown
}

/**
 * O número já gravado no rascunho pode ser reusado nesta tentativa?
 * Só se for uma DPS NACIONAL do MESMO ambiente e série válidos. RPS do
 * conector municipal (removido em 2026-11-06: série "RPS", número de
 * Date.now()) ou DPS de outro ambiente → aloca um número novo.
 */
export function podeReusarDps(existente: DpsPersistida, atual: { tpAmb: '1' | '2' }): boolean {
  return existente.provedor === 'nacional'
    && existente.tpAmb === atual.tpAmb
    && serieDpsValida(existente.serie)
    && numeroDpsValido(existente.numero)
}
