/**
 * Logout por inatividade (administrador e fiscal): 30 min sem mexer em
 * nenhuma aba do JP Fiscal encerra a sessão. Esses perfis veem senhas de
 * portal, certificado A1 e emitem nota — computador destravado no escritório
 * não pode ficar com a sessão aberta o dia inteiro.
 *
 * A última atividade fica no localStorage: mexer numa aba mantém as outras
 * vivas, e a aba esquecida em segundo plano também sai no prazo. Lógica pura
 * aqui (testada); o hook está em src/hooks/use-logout-inatividade.ts.
 */
export const LIMITE_INATIVIDADE_MS = 30 * 60_000
export const AVISO_ANTES_MS = 60_000
export const CHAVE_ULTIMA_ATIVIDADE = 'sessao:ultima-atividade'
export const CHAVE_MOTIVO_SAIDA = 'auth:motivo-saida'
export const MOTIVO_INATIVIDADE = 'inatividade'

export type EstadoInatividade = 'ativo' | 'aviso' | 'expirado'

export function estadoInatividade(
  agora: number,
  ultimaAtividade: number,
  limite = LIMITE_INATIVIDADE_MS,
  aviso = AVISO_ANTES_MS,
): EstadoInatividade {
  const parado = agora - ultimaAtividade
  if (parado >= limite) return 'expirado'
  if (parado >= limite - aviso) return 'aviso'
  return 'ativo'
}

/** Lê a última atividade gravada; valor inválido ou no futuro conta como "agora". */
export function lerUltimaAtividade(bruto: string | null, agora: number): number {
  const n = Number(bruto)
  if (!Number.isFinite(n) || n <= 0 || n > agora + 60_000) return agora
  return n
}
