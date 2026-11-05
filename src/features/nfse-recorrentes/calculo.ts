/**
 * Contrato de emissão recorrente — lógica pura, sem Firestore.
 *
 * Responde as duas perguntas que a tela precisa fazer e o gerador vai repetir do
 * lado do servidor: "este contrato está valendo hoje?" e "quando ele emite a
 * próxima nota?". Vive separada para ser testada — errar aqui é emitir nota que
 * não devia ou deixar de emitir a que devia, e ambos só aparecem depois.
 */

export type ContratoRecorrenteCalculo = {
  ativo?: boolean | null
  valor?: number | null
  /** Dia do mês, 1–31. Mês curto é resolvido por clampDiaEmissao. */
  diaEmissao?: number | null
  dataInicio?: Date | null
  dataFim?: Date | null
}

/** Último dia do mês (mes 1–12). `new Date(ano, mes, 0)` volta para o mês anterior. */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

/**
 * Prende o dia de emissão ao tamanho do mês.
 *
 * Contrato marcado para o dia 31 em fevereiro emite no dia 28 (ou 29), não no
 * dia 3 de março: `new Date(2026, 1, 31)` transborda em silêncio para março, e
 * nota fiscal emitida na competência errada é retrabalho na prefeitura, não um
 * detalhe de calendário.
 */
export function clampDiaEmissao(dia: number, ano: number, mes: number): number {
  const seguro = Number.isFinite(dia) ? Math.trunc(dia) : 1
  if (seguro < 1) return 1
  return Math.min(seguro, ultimoDiaDoMes(ano, mes))
}

/**
 * Contrato valendo na data. São dois desligamentos diferentes e ambos contam:
 * `ativo` (suspenso na mão) e `dataFim` (encerrado na data) — foi a ausência do
 * segundo que fez contrato encerrado faturar para sempre em clientes_servicos.
 *
 * A comparação é por DIA: hora não entra, senão contrato que começa hoje às 00h
 * pareceria futuro para quem abre a tela às 9h.
 */
export function contratoVigenteEm(contrato: ContratoRecorrenteCalculo, referencia: Date): boolean {
  if (contrato.ativo === false) return false

  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const hoje = dia(referencia)

  if (contrato.dataInicio && dia(contrato.dataInicio) > hoje) return false
  if (contrato.dataFim && dia(contrato.dataFim) < hoje) return false
  return true
}

/**
 * Data da próxima emissão, ou `null` quando o contrato não emite mais (inativo
 * ou passado da vigência).
 *
 * Devolve o dia de HOJE quando a emissão é hoje — o contador precisa ver "emite
 * hoje", não "emitiu ontem" nem "só mês que vem".
 */
export function proximaEmissao(
  contrato: ContratoRecorrenteCalculo,
  referencia: Date,
): Date | null {
  if (contrato.ativo === false) return null

  const diaDesejado = contrato.diaEmissao ?? 1
  const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  // Contrato que ainda não começou conta a partir da vigência, não de hoje —
  // senão contrato assinado hoje para começar em janeiro apareceria como "sem
  // próxima emissão", que é o oposto do que acontece.
  const inicio = contrato.dataInicio ? inicioDoDia(contrato.dataInicio) : null
  const hoje = inicioDoDia(referencia)
  const piso = inicio && inicio > hoje ? inicio : hoje

  // Duas tentativas bastam: se o dia do mês do piso já passou, o próximo é no
  // mês seguinte — e o clamp resolve o mês curto em ambos.
  for (let salto = 0; salto <= 1; salto += 1) {
    const base = new Date(piso.getFullYear(), piso.getMonth() + salto, 1)
    const ano = base.getFullYear()
    const mes = base.getMonth() + 1
    const candidato = new Date(ano, mes - 1, clampDiaEmissao(diaDesejado, ano, mes))

    if (candidato < piso) continue
    if (contrato.dataFim && candidato > inicioDoDia(contrato.dataFim)) return null
    return candidato
  }

  return null
}

/** Soma do que os contratos vigentes faturam por mês. Contrato parado não entra. */
export function totalMensalVigente(
  contratos: ContratoRecorrenteCalculo[],
  referencia: Date,
): number {
  return contratos
    .filter((c) => contratoVigenteEm(c, referencia))
    .reduce((soma, c) => soma + (c.valor && c.valor > 0 ? c.valor : 0), 0)
}
