import type { UserSession } from './auth-client'
// Fonte única de perfis/telas, compartilhada com as Cloud Functions (que
// validam o que o admin grava). Módulo puro — sem dependência de firebase.
import {
  PERFIL_DEFAULT_TELAS,
  PERFIS_CREDENCIAIS,
  PERFIL_LABELS as PERFIL_LABELS_INTERNO,
  ehPerfil,
  type TelaKey,
} from '../../functions/src/usuarios/perfis'

export type { Perfil, TelaKey } from '../../functions/src/usuarios/perfis'
export { PERFIS, PERFIL_LABELS, PERFIL_DEFAULT_TELAS, TELAS, ehPerfil, podeLerFinanceiro } from '../../functions/src/usuarios/perfis'

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

/** Senhas de portal dos clientes: só admin e fiscal (espelha PERFIS_CREDENCIAIS dos callables de credenciais). */
export function podeVerCredenciais(usuario: Pick<UserSession, 'perfil'> | null | undefined): boolean {
  return !!usuario && (PERFIS_CREDENCIAIS as readonly string[]).includes(usuario.perfil)
}

/**
 * Emitir, emitir em lote, preparar rascunhos do mês, revisar/remover rascunho,
 * consultar, cancelar e reprocessar NFS-e: só administrador e fiscal. Espelha
 * as Cloud Functions (assertCanAccessCliente(..., 'fiscal') e
 * assertPerfil(['admin', 'fiscal']) em functions/src/nfse) e as regras de
 * nfse_rascunhos (isFiscal()). O perfil financeiro tem a tela 'fiscal' só para
 * LER as notas (canReadNfse) — não opera.
 */
export function podeOperarNfse(usuario: Pick<UserSession, 'perfil'> | null | undefined): boolean {
  return !!usuario && (usuario.perfil === 'admin' || usuario.perfil === 'fiscal')
}

/**
 * Quem cria/edita registros de cada módulo — espelha os `allow create` de
 * firestore.rules (clientes: isOperacional; tarefas/competências/IR:
 * isEquipeContabil; lançamentos: isFinanceiro). Ter a tela não basta: o perfil
 * "leitura" vê Clientes mas não cadastra.
 */
const PERFIS_ESCRITA = {
  clientes: ['admin', 'operacional'],
  tarefas: ['admin', 'operacional', 'fiscal'],
  competencias: ['admin', 'operacional', 'fiscal'],
  ir: ['admin', 'operacional', 'fiscal'],
  financeiro: ['admin', 'financeiro'],
} as const satisfies Partial<Record<TelaKey, readonly string[]>>

export type TelaComEscrita = keyof typeof PERFIS_ESCRITA

export function podeEscreverEm(usuario: UserSession | null | undefined, tela: TelaComEscrita): boolean {
  if (!usuario || !canAccessTela(usuario, tela)) return false
  return (PERFIS_ESCRITA[tela] as readonly string[]).includes(usuario.perfil)
}

/**
 * Tela que guarda uma rota do app (a mesma que o AuthGuard usa para barrar).
 * Aceita href com query/hash. `null` = rota sem tela (login, raiz…).
 */
export function telaDaRota(href: string): TelaKey | null {
  const pathname = href.split(/[?#]/)[0]
  if (pathname.startsWith('/hoje')) return 'hoje'
  if (pathname.startsWith('/clientes')) return 'clientes'
  if (pathname.startsWith('/tarefas')) return 'tarefas'
  if (pathname.startsWith('/competencias')) return 'competencias'
  if (pathname.startsWith('/fechamento')) return 'fechamento'
  if (pathname.startsWith('/financeiro')) return 'financeiro'
  if (pathname.startsWith('/fiscal')) return 'fiscal'
  if (pathname.startsWith('/ir')) return 'ir'
  // Mesmas telas da sidebar (app-sidebar.tsx): sem isto os relatórios abriam
  // por URL para qualquer perfil — Carteira tem receita por cliente.
  if (pathname.startsWith('/relatorios/carteira')) return 'financeiro'
  if (pathname.startsWith('/relatorios/produtividade')) return 'admin'
  if (pathname.startsWith('/servicos')) return 'servicos'
  if (pathname.startsWith('/admin/servicos')) return 'servicos'
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  return null
}

const ROTA_DE_CRIACAO = /\/(novo|nova|editar|importar)\/?$/

/**
 * O link leva a algo que o perfil consegue usar? Além da tela, criação/edição
 * (`/novo`, `/nova`, `/editar`, `/importar`) exige escrita no módulo, e abrir a
 * emissão (`/fiscal?emitir=1`) exige quem emite NFS-e. Usado para não oferecer
 * no Painel, no Hoje e nos menus um link que só redirecionaria.
 */
export function podeAbrirRota(usuario: UserSession | null | undefined, href: string): boolean {
  if (!usuario) return false
  const tela = telaDaRota(href)
  if (!tela) return true
  if (!canAccessTela(usuario, tela)) return false
  const [pathname, query = ''] = href.split('#')[0].split('?')
  if (tela === 'fiscal' && new URLSearchParams(query).get('emitir') === '1') return podeOperarNfse(usuario)
  if (ROTA_DE_CRIACAO.test(pathname) && tela in PERFIS_ESCRITA) {
    return podeEscreverEm(usuario, tela as TelaComEscrita)
  }
  return true
}

/** Nome da tela para mensagens ao usuário ("Você não tem acesso a Financeiro"). */
export const TELA_LABELS: Record<TelaKey, string> = {
  hoje: 'Hoje',
  dashboard: 'Painel',
  clientes: 'Clientes',
  servicos: 'Tipos de serviço',
  competencias: 'Competências',
  tarefas: 'Tarefas',
  fechamento: 'Fechamento mensal',
  fiscal: 'NFS-e',
  ir: 'Imposto de Renda',
  financeiro: 'Financeiro',
  admin: 'Administração',
}

/** Rótulo do perfil para a interface ("Somente Leitura", não "leitura"). */
export function rotuloPerfil(perfil: string | null | undefined): string {
  if (!perfil) return ''
  return ehPerfil(perfil) ? PERFIL_LABELS_INTERNO[perfil] : perfil
}
