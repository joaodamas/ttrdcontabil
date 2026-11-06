/**
 * Regras puras da auditoria por trigger (sem firebase): que ação foi, quais
 * campos mudaram e o que entra no log. Testado em __tests__/lib/auditoria-trigger.test.ts.
 */

/** Coleções cujo CRUD é auditado no servidor (triggers), não mais pelo navegador. */
export const COLECOES_AUDITADAS_NO_SERVIDOR = [
  'clientes',
  'clientes_fiscal',
  'clientes_credenciais',
  'lancamentos',
  'usuarios',
] as const
export type ColecaoAuditada = (typeof COLECOES_AUDITADAS_NO_SERVIDOR)[number]

/**
 * Mudanças que sozinhas não geram log: carimbos que acompanham toda escrita,
 * o último acesso (a cada login) e a lista de senhas preenchidas (mantida por
 * trigger; a mudança de senha já tem log próprio em clientes_credenciais).
 */
const CAMPOS_RUIDO = new Set([
  'atualizadoEm',
  'atualizadoPorId',
  'atualizadoPorNome',
  'ultimoAcesso',
  'credenciaisPreenchidas',
])

type Dados = Record<string, unknown> | null | undefined

function normalizar(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    // Timestamp do Admin SDK (ou do SDK web nos testes): compara pelo instante.
    if (typeof o.toMillis === 'function') return `ts:${(o.toMillis as () => number)()}`
    if (Array.isArray(v)) return v.map(normalizar)
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, normalizar(o[k])]))
  }
  return v
}

function iguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
}

export function camposAlterados(antes: Dados, depois: Dados): string[] {
  const a = antes ?? {}
  const d = depois ?? {}
  const chaves = new Set([...Object.keys(a), ...Object.keys(d)])
  return [...chaves].filter((k) => !iguais(a[k], d[k])).sort()
}

export type AcaoAuditada = 'create' | 'update' | 'delete' | 'soft_delete' | 'restore'

/**
 * Ação e campos alterados, ou `null` quando a escrita é só ruído (carimbos,
 * último acesso) e não merece log.
 */
export function classificarEscrita(antes: Dados, depois: Dados): { acao: AcaoAuditada; campos: string[] } | null {
  if (!antes && !depois) return null
  if (!antes) return { acao: 'create', campos: Object.keys(depois ?? {}).sort() }
  if (!depois) return { acao: 'delete', campos: Object.keys(antes).sort() }
  const campos = camposAlterados(antes, depois)
  if (campos.every((k) => CAMPOS_RUIDO.has(k))) return null
  if (!antes.deletedAt && depois.deletedAt) return { acao: 'soft_delete', campos }
  if (antes.deletedAt && !depois.deletedAt) return { acao: 'restore', campos }
  return { acao: 'update', campos }
}

/**
 * O que vai para dadosAntes/dadosDepois. Senhas de portal: só os NOMES dos
 * campos preenchidos (nem o valor cifrado entra no log). As demais coleções
 * vão inteiras e passam pelo redactAuditData de audit.ts.
 */
export function dadosParaLog(colecao: ColecaoAuditada, dados: Dados, camposPreenchidos: (d: Record<string, unknown>) => string[]) {
  if (!dados) return null
  if (colecao === 'clientes_credenciais') {
    return { camposPreenchidos: camposPreenchidos(dados), tenantId: dados.tenantId ?? null, clienteId: dados.clienteId ?? null }
  }
  return dados
}

/**
 * Ator do log a partir do contexto de autenticação do evento do Firestore.
 * Usuário final do Firebase Auth chega como authType 'app_user' (documentação
 * do Eventarc; o tipo AuthType do firebase-functions 6.x não lista esse valor)
 * com authId = uid. Conta de serviço (Admin SDK, scripts, console) chega com o
 * e-mail da conta em authId. Na dúvida, um authId sem '@' é tratado como uid —
 * o trigger confirma no Firebase Auth antes de usar o nome.
 */
export function atorDoEvento(authType: string | undefined, authId: string | undefined) {
  if (authId && (authType === 'app_user' || !authId.includes('@'))) return { tipo: 'usuario' as const, id: authId }
  return { tipo: 'sistema' as const, id: authId || 'system', authType: authType ?? 'unknown' }
}
