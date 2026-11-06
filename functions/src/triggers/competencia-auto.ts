/**
 * Conclusão automática da competência quando a última tarefa dela é concluída
 * (trigger onTarefaConcluida). Lógica pura, sem Firestore, para teste.
 *
 * O trigger roda como servidor (Admin SDK ignora as regras), então precisa
 * respeitar sozinho a matriz de transição de src/lib/status-transitions.ts e
 * de competenciaTransicaoPermitida() em firestore.rules. Para um usuário que
 * não é admin, só os estados ativos (aberta/em_andamento) podem ir para
 * 'concluida'; 'cancelada' → 'concluida' nunca é permitido (é preciso reabrir
 * antes). O automático não tem perfil de admin: não reabre nem ressuscita.
 */

export const STATUS_COMPETENCIA_CONCLUIVEIS = ['aberta', 'em_andamento'] as const

export type DecisaoConclusaoAutomatica =
  | { concluir: true }
  | { concluir: false; motivo: 'competencia_inexistente' | 'ja_concluida' | 'transicao_invalida' }

export function decidirConclusaoAutomatica(
  competencia: { existe: boolean; status?: unknown },
): DecisaoConclusaoAutomatica {
  if (!competencia.existe) return { concluir: false, motivo: 'competencia_inexistente' }
  if (competencia.status === 'concluida') return { concluir: false, motivo: 'ja_concluida' }
  // Doc legado sem status: as regras não bloqueiam a transição (ver
  // competenciaTransicaoPermitida), e o form trata a ausência como 'aberta'.
  if (competencia.status === undefined || competencia.status === null) return { concluir: true }
  if ((STATUS_COMPETENCIA_CONCLUIVEIS as readonly unknown[]).includes(competencia.status)) return { concluir: true }
  return { concluir: false, motivo: 'transicao_invalida' }
}
