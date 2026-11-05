/**
 * Códigos IBGE gravados ERRADO pela plataforma até 2026-11-05 (conferido na API
 * de localidades do IBGE): 3508900 é Caiabu e 3552502 é Suzano. Configs antigas
 * continuam valendo — normalizarIbge() converte para o código certo na leitura.
 * Espelho de IBGE_LEGADO em functions/src/nfse/types.ts.
 */
export const IBGE_LEGADO: Record<string, string> = {
  '3508900': '3509205', // gravado como Cajamar
  '3552502': '3552809', // gravado como Taboão da Serra
}

export function normalizarIbge(ibge: string | undefined | null): string {
  const codigo = String(ibge ?? '').trim()
  return IBGE_LEGADO[codigo] ?? codigo
}
