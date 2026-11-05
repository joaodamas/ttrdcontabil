import type { UserSession } from './auth-client'
// Fonte única de perfis/telas, compartilhada com as Cloud Functions (que
// validam o que o admin grava). Módulo puro — sem dependência de firebase.
import {
  PERFIL_DEFAULT_TELAS,
  PERFIS_CREDENCIAIS,
  ehPerfil,
  type TelaKey,
} from '../../functions/src/usuarios/perfis'

export type { Perfil, TelaKey } from '../../functions/src/usuarios/perfis'
export { PERFIS, PERFIL_LABELS, PERFIL_DEFAULT_TELAS, TELAS, ehPerfil } from '../../functions/src/usuarios/perfis'

export function canAccessTela(usuario: UserSession | null, tela: TelaKey): boolean {
  if (!usuario) return false

  // Explicit user overrides by telas array when present.
  if (Array.isArray(usuario.telas) && usuario.telas.length > 0) {
    return usuario.telas.includes(tela)
  }

  const defaults = ehPerfil(usuario.perfil) ? PERFIL_DEFAULT_TELAS[usuario.perfil] : PERFIL_DEFAULT_TELAS.leitura
  return defaults.includes(tela)
}

export function canAccessAnyTela(usuario: UserSession | null, telas: TelaKey[]): boolean {
  return telas.some((t) => canAccessTela(usuario, t))
}

/** Senhas de portal dos clientes: só admin e fiscal (espelha podeVerCredenciais() nas regras). */
export function podeVerCredenciais(usuario: Pick<UserSession, 'perfil'> | null | undefined): boolean {
  return !!usuario && (PERFIS_CREDENCIAIS as readonly string[]).includes(usuario.perfil)
}
