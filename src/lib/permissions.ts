import type { UserSession } from './auth-client'

export type TelaKey =
  | 'hoje'
  | 'clientes'
  | 'tarefas'
  | 'competencias'
  | 'fechamento'
  | 'financeiro'
  | 'fiscal'
  | 'ir'
  | 'admin'
  | 'servicos'
  | 'dashboard'

const PERFIL_DEFAULT_TELAS: Record<string, TelaKey[]> = {
  admin: ['hoje', 'clientes', 'tarefas', 'competencias', 'fechamento', 'financeiro', 'fiscal', 'ir', 'admin', 'servicos', 'dashboard'],
  operacional: ['hoje', 'clientes', 'tarefas', 'competencias', 'fechamento', 'dashboard'],
  fiscal: ['hoje', 'clientes', 'tarefas', 'competencias', 'fechamento', 'fiscal', 'ir', 'dashboard'],
  financeiro: ['hoje', 'clientes', 'financeiro', 'fiscal', 'dashboard'],
  leitura: ['hoje', 'clientes', 'dashboard'],
}

export function canAccessTela(usuario: UserSession | null, tela: TelaKey): boolean {
  if (!usuario) return false

  // Explicit user overrides by telas array when present.
  if (Array.isArray(usuario.telas) && usuario.telas.length > 0) {
    return usuario.telas.includes(tela)
  }

  const defaults = PERFIL_DEFAULT_TELAS[usuario.perfil] ?? PERFIL_DEFAULT_TELAS.leitura
  return defaults.includes(tela)
}

export function canAccessAnyTela(usuario: UserSession | null, telas: TelaKey[]): boolean {
  return telas.some((t) => canAccessTela(usuario, t))
}
