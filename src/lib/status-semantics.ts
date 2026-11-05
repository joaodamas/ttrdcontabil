/**
 * Vocabulário único de status → (rótulo, tom semântico).
 *
 * Toda tela que mostra o status de uma entidade usa este mapa (via os
 * componentes de `@/components/ui/status-badge`), para que "Emitida",
 * "Pendente", "Concluída" etc. tenham sempre a mesma cor.
 *
 * Regra dos tons:
 * - success     → concluído / em dia (Emitida, Concluída, Pago, Entregue, Ativo)
 * - warning     → aguarda ação ou atenção (Pendente, Aberta, Alta, Suspenso)
 * - info        → em curso (Em andamento, Aguardando emissão)
 * - destructive → erro / atraso / bloqueio (Rejeitada, Erro, Atrasado, Urgente)
 * - neutral     → encerrado sem efeito (Cancelada, Inativo, Rascunho, Baixa)
 * - outline     → valor desconhecido ou sem peso (Normal)
 */

export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'neutral' | 'outline'

export interface StatusInfo {
  label: string
  tone: StatusTone
}

export type StatusEntity =
  | 'cliente'
  | 'competencia'
  | 'tarefa'
  | 'tarefaPrioridade'
  | 'pagamento'
  | 'nfse'
  | 'ir'
  | 'ambiente'

const STATUS_SEMANTICS: Record<StatusEntity, Record<string, StatusInfo>> = {
  cliente: {
    ativo: { label: 'Ativo', tone: 'success' },
    inativo: { label: 'Inativo', tone: 'neutral' },
    suspenso: { label: 'Suspenso', tone: 'warning' },
  },
  competencia: {
    aberta: { label: 'Aberta', tone: 'warning' },
    em_andamento: { label: 'Em andamento', tone: 'info' },
    concluida: { label: 'Concluída', tone: 'success' },
    cancelada: { label: 'Cancelada', tone: 'neutral' },
  },
  tarefa: {
    pendente: { label: 'Pendente', tone: 'warning' },
    em_andamento: { label: 'Em andamento', tone: 'info' },
    concluida: { label: 'Concluída', tone: 'success' },
    cancelada: { label: 'Cancelada', tone: 'neutral' },
  },
  tarefaPrioridade: {
    baixa: { label: 'Baixa', tone: 'neutral' },
    normal: { label: 'Normal', tone: 'outline' },
    alta: { label: 'Alta', tone: 'warning' },
    urgente: { label: 'Urgente', tone: 'destructive' },
  },
  pagamento: {
    pendente: { label: 'Pendente', tone: 'warning' },
    pago: { label: 'Pago', tone: 'success' },
    atrasado: { label: 'Atrasado', tone: 'destructive' },
    cancelado: { label: 'Cancelado', tone: 'neutral' },
    estornado: { label: 'Estornado', tone: 'neutral' },
  },
  nfse: {
    emitida: { label: 'Emitida', tone: 'success' },
    pendente_processamento: { label: 'Pendente', tone: 'warning' },
    cancelamento_pendente: { label: 'Cancelamento pendente', tone: 'warning' },
    rascunho: { label: 'Rascunho', tone: 'neutral' },
    validando: { label: 'Validando', tone: 'info' },
    pronto_para_emitir: { label: 'Pronto para emitir', tone: 'info' },
    aguardando_emissao: { label: 'Aguardando emissão', tone: 'info' },
    erro_validacao: { label: 'Erro de validação', tone: 'destructive' },
    rejeitada: { label: 'Rejeitada', tone: 'destructive' },
    erro_integracao: { label: 'Erro', tone: 'destructive' },
    cancelada: { label: 'Cancelada', tone: 'neutral' },
  },
  ir: {
    pendente: { label: 'Pendente', tone: 'warning' },
    em_andamento: { label: 'Em andamento', tone: 'info' },
    entregue: { label: 'Entregue', tone: 'success' },
    retificado: { label: 'Retificado', tone: 'info' },
    cancelado: { label: 'Cancelado', tone: 'neutral' },
  },
  ambiente: {
    producao: { label: 'Produção', tone: 'success' },
    homologacao: { label: 'Homologação', tone: 'warning' },
  },
}

/** Rótulo + tom de um status; valor desconhecido vira rótulo cru com tom `outline`. */
export function getStatusInfo(entity: StatusEntity, value: string | null | undefined): StatusInfo {
  const key = value ?? ''
  return STATUS_SEMANTICS[entity][key] ?? { label: key || '—', tone: 'outline' }
}

/** Só o rótulo — para filtros, exportações e textos corridos. */
export function getStatusLabel(entity: StatusEntity, value: string | null | undefined): string {
  return getStatusInfo(entity, value).label
}

/** Chaves conhecidas de uma entidade, na ordem declarada. */
export function getStatusKeys(entity: StatusEntity): string[] {
  return Object.keys(STATUS_SEMANTICS[entity])
}
