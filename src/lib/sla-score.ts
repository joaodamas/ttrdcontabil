import { tsToDate } from '@/lib/utils'

type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente'

/**
 * Score operacional de SLA para ordenar tarefas por criticidade.
 * Quanto maior, mais urgente priorizar.
 */
export function scoreSlaTarefa(tarefa: Record<string, unknown>, agora: Date): number {
  const prioridade = (tarefa.prioridade as Prioridade | undefined) ?? 'normal'
  const titulo = String(tarefa.titulo ?? '').toLowerCase()
  const isFiscal = titulo.includes('fiscal')
  const dataPrazo = tsToDate(tarefa.dataPrazo)

  const basePorPrioridade: Record<Prioridade, number> = {
    baixa: 10,
    normal: 25,
    alta: 45,
    urgente: 65,
  }
  let score = basePorPrioridade[prioridade]

  if (isFiscal) score += 15

  if (!dataPrazo) return score

  const diasDiff = Math.floor((agora.getTime() - dataPrazo.getTime()) / 86_400_000)
  if (diasDiff > 0) {
    score += 20 + diasDiff * 4
  } else {
    const diasParaVencer = Math.ceil((dataPrazo.getTime() - agora.getTime()) / 86_400_000)
    if (diasParaVencer <= 2) score += 10
  }

  return score
}
