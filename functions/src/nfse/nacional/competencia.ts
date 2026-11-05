/**
 * Data de competência (dCompet) da DPS nacional.
 *
 * Honorários costumam ser faturados no mês seguinte ao serviço: a competência é
 * o mês do serviço, não o dia da emissão. Com competência vinculada (mes/ano),
 * usa o 1º dia daquele mês; data explícita AAAA-MM-DD tem prioridade. A Sefin
 * recusa competência posterior à emissão, então o resultado nunca passa dela.
 */
export function dataCompetenciaDps(
  competencia: { mes: number; ano: number } | string | undefined | null,
  dataEmissao: string,
): string {
  let data: string | undefined
  if (typeof competencia === 'string') {
    data = /^\d{4}-\d{2}-\d{2}$/.test(competencia) ? competencia : undefined
  } else if (competencia && competencia.mes >= 1 && competencia.mes <= 12 && competencia.ano >= 2000) {
    data = `${competencia.ano}-${String(competencia.mes).padStart(2, '0')}-01`
  }
  if (!data) return dataEmissao
  return data > dataEmissao ? dataEmissao : data
}
