/**
 * Log estruturado das functions (Cloud Logging). `logErro` grava severity
 * ERROR com jsonPayload — é o que as métricas/alertas de
 * scripts/configurar-alertas.sh contam (docs/OPERACAO-ALERTAS.md). Um
 * console.error com objeto vira texto solto e o Error perde a pilha.
 *
 * `evento` é fixo e pesquisável (ex.: '[backup][falha]'); dados variáveis vão
 * no contexto, nunca na mensagem. Não ponha segredo, senha nem PII no contexto.
 */
import { logger } from 'firebase-functions/v2'

export function descreverErro(err: unknown): { erro: string; erroTipo?: string; stack?: string } {
  if (err instanceof Error) return { erro: err.message, erroTipo: err.name, stack: err.stack }
  return { erro: typeof err === 'string' ? err : JSON.stringify(err) ?? String(err) }
}

export function logErro(evento: string, contexto: Record<string, unknown> = {}, err?: unknown) {
  logger.error(evento, { evento, ...contexto, ...(err === undefined ? {} : descreverErro(err)) })
}
