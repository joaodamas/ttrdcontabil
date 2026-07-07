import type { StatusCompetencia, StatusTarefa } from '@/types/firestore'

/**
 * Matriz de transição de status de competência e tarefa.
 *
 * Regra geral: qualquer usuário que já pode editar o registro (operacional+)
 * pode transicionar livremente entre os estados "ativos" (aberta/em_andamento
 * para competência; pendente/em_andamento para tarefa) e movê-los para um
 * estado terminal (concluida/cancelada). SAIR de um estado terminal — reabrir
 * uma competência/tarefa concluída, ou ressuscitar uma cancelada — é a parte
 * arriscada apontada na auditoria e exige um papel mais restrito (ver funções
 * abaixo). Mover de 'cancelada' direto para 'concluida' nunca é permitido:
 * é preciso reabrir primeiro (aberta/pendente ou em_andamento) para então
 * concluir, garantindo que a pré-condição de conclusão seja sempre avaliada.
 *
 * Espelhado em `firestore.rules` (competenciaTransicaoPermitida /
 * tarefaTransicaoPermitida) para que a regra não possa ser burlada por um
 * update direto via SDK/API — mantenha as duas implementações em sincronia.
 */

const COMPETENCIA_ESTADOS_TERMINAIS: readonly StatusCompetencia[] = ['concluida', 'cancelada']

const COMPETENCIA_TRANSICOES: Record<StatusCompetencia, StatusCompetencia[]> = {
  aberta:       ['aberta', 'em_andamento', 'concluida', 'cancelada'],
  em_andamento: ['em_andamento', 'aberta', 'concluida', 'cancelada'],
  concluida:    ['concluida', 'aberta', 'em_andamento', 'cancelada'],
  cancelada:    ['cancelada', 'aberta', 'em_andamento'],
}

/**
 * Status de destino permitidos a partir de `atual`, considerando o perfil do
 * usuário logado. Sempre inclui o próprio `atual` (salvar sem trocar status).
 * Reabrir uma competência concluída ou ressuscitar uma cancelada exige admin.
 */
export function opcoesStatusCompetencia(atual: StatusCompetencia, perfil?: string): StatusCompetencia[] {
  const candidatos = COMPETENCIA_TRANSICOES[atual] ?? [atual]
  if (perfil === 'admin' || !COMPETENCIA_ESTADOS_TERMINAIS.includes(atual)) return candidatos
  return [atual]
}

export function competenciaPodeTransicionar(de: StatusCompetencia, para: StatusCompetencia, perfil?: string): boolean {
  return opcoesStatusCompetencia(de, perfil).includes(para)
}

const TAREFA_ESTADOS_TERMINAIS: readonly StatusTarefa[] = ['concluida', 'cancelada']

const TAREFA_TRANSICOES: Record<StatusTarefa, StatusTarefa[]> = {
  pendente:     ['pendente', 'em_andamento', 'concluida', 'cancelada'],
  em_andamento: ['em_andamento', 'pendente', 'concluida', 'cancelada'],
  concluida:    ['concluida', 'pendente', 'em_andamento', 'cancelada'],
  cancelada:    ['cancelada', 'pendente', 'em_andamento'],
}

export interface TarefaTransicaoContexto {
  perfil?: string
  /** true se o usuário logado é o responsável atual pela tarefa. */
  isResponsavel?: boolean
}

/**
 * Status de destino permitidos a partir de `atual` para uma tarefa. Reabrir
 * uma tarefa concluída/ressuscitar uma cancelada exige admin OU ser o
 * responsável atual pela tarefa (tarefas são mais operacionais que
 * competências — travar para admin-only prejudicaria o dia a dia; ver
 * decisão sinalizada ao dono do produto no relatório de entrega).
 */
export function opcoesStatusTarefa(atual: StatusTarefa, ctx: TarefaTransicaoContexto = {}): StatusTarefa[] {
  const candidatos = TAREFA_TRANSICOES[atual] ?? [atual]
  if (ctx.perfil === 'admin' || ctx.isResponsavel || !TAREFA_ESTADOS_TERMINAIS.includes(atual)) return candidatos
  return [atual]
}

export function tarefaPodeTransicionar(
  de: StatusTarefa,
  para: StatusTarefa,
  ctx: TarefaTransicaoContexto = {}
): boolean {
  return opcoesStatusTarefa(de, ctx).includes(para)
}
