/**
 * Perfis, telas e o que cada perfil enxerga por padrão — FONTE ÚNICA.
 *
 * Importado pelas Cloud Functions (validação dos callables de usuário) e pelo
 * front (src/lib/permissions.ts, formulário de usuários). Antes havia duas
 * tabelas de padrão que discordavam (permissions.ts × usuario-form.tsx): o
 * formulário pré-marcava Competências e Tarefas para "leitura", a guarda de
 * rota não. Vale a de permissions.ts, que é a que decidia o acesso real.
 *
 * Módulo puro, sem dependência de firebase — o vitest da raiz e o Next o
 * importam direto daqui.
 */

export const PERFIS = ['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'] as const
export type Perfil = (typeof PERFIS)[number]

export const PERFIL_LABELS: Record<Perfil, string> = {
  admin: 'Administrador',
  operacional: 'Operacional',
  fiscal: 'Fiscal',
  financeiro: 'Financeiro',
  leitura: 'Somente Leitura',
}

export const TELAS = [
  'hoje',
  'dashboard',
  'clientes',
  'servicos',
  'competencias',
  'tarefas',
  'fechamento',
  'fiscal',
  'ir',
  'financeiro',
  'admin',
] as const
export type TelaKey = (typeof TELAS)[number]

export const PERFIL_DEFAULT_TELAS: Record<Perfil, readonly TelaKey[]> = {
  admin: TELAS,
  operacional: ['hoje', 'dashboard', 'clientes', 'competencias', 'tarefas', 'fechamento'],
  fiscal: ['hoje', 'dashboard', 'clientes', 'competencias', 'tarefas', 'fechamento', 'fiscal', 'ir'],
  financeiro: ['hoje', 'dashboard', 'clientes', 'financeiro', 'fiscal'],
  leitura: ['hoje', 'dashboard', 'clientes'],
}

/**
 * Perfis que leem/gravam as senhas de portal dos clientes
 * (clientes_credenciais). Decisão do dono, 2026-11-05: só administrador e
 * fiscal. Conferido nos callables de functions/src/clientes/credenciais-callables.ts
 * (as regras negam clientes_credenciais ao navegador).
 */
export const PERFIS_CREDENCIAIS: readonly Perfil[] = ['admin', 'fiscal']

export function ehPerfil(valor: unknown): valor is Perfil {
  return typeof valor === 'string' && (PERFIS as readonly string[]).includes(valor)
}

export function ehTela(valor: unknown): valor is TelaKey {
  return typeof valor === 'string' && (TELAS as readonly string[]).includes(valor)
}

/**
 * Lê/emite NFS-e e o DANFSe: espelha canReadNfse() de firestore.rules —
 * perfil fiscal/financeiro/admin OU a tela 'fiscal' concedida ao usuário.
 */
export function podeLerNfse(usuario: { perfil?: unknown; telas?: unknown }): boolean {
  if (usuario.perfil === 'admin' || usuario.perfil === 'fiscal' || usuario.perfil === 'financeiro') return true
  return Array.isArray(usuario.telas) && usuario.telas.includes('fiscal')
}

/**
 * Lê o financeiro (lançamentos, KPIs financeiros do Painel): espelha
 * canReadFinanceiro() de firestore.rules — perfil admin/financeiro OU a tela
 * 'financeiro' concedida ao usuário.
 */
export function podeLerFinanceiro(usuario: { perfil?: unknown; telas?: unknown }): boolean {
  if (usuario.perfil === 'admin' || usuario.perfil === 'financeiro') return true
  return Array.isArray(usuario.telas) && usuario.telas.includes('financeiro')
}
