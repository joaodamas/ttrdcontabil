export const queryStaleTimes = {
  realtime:    30_000,       // 30s  — fila Hoje, alertas urgentes
  operational: 2 * 60_000,  // 2min — tarefas, competências, financeiro
  fiscal:      3 * 60_000,  // 3min — NFS-e, rascunhos
  financial:   2 * 60_000,  // 2min — lançamentos
  reference:   10 * 60_000, // 10min — clientes, serviços, usuários (dados de referência)
} as const
