/**
 * Log de falha dos callables de emissão com a severidade certa.
 *
 * A métrica de alerta do Cloud Monitoring (PR #29) conta os logs ERROR de
 * "[emitirNfse] processarEmissao falhou". Bloqueio da pré-validação
 * (failed-precondition + details.codigo 'PRE_VALIDACAO') e outros erros do
 * usuário (dado inválido, sem permissão, nota já em envio) NÃO são falha da
 * plataforma: vão como WARNING. ERROR fica para o que é falha real (Sefin
 * indisponível, timeout, exceção inesperada).
 */
import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { textoSeguroParaLog } from '../audit'

/** Códigos de HttpsError que a própria function lança para recusar o pedido do usuário. */
const CODIGOS_DO_USUARIO = new Set([
  'failed-precondition',
  'invalid-argument',
  'permission-denied',
  'unauthenticated',
  'not-found',
  'already-exists',
  'aborted',
])

function ehHttpsError(err: unknown): err is HttpsError {
  // instanceof falha se duas cópias do firebase-functions forem carregadas
  // (testes): HttpsError sempre tem `code` e `httpErrorCode`.
  return err instanceof HttpsError
    || (typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string' && 'httpErrorCode' in err)
}

export function severidadeDaFalha(err: unknown): 'WARNING' | 'ERROR' {
  return ehHttpsError(err) && CODIGOS_DO_USUARIO.has(err.code) ? 'WARNING' : 'ERROR'
}

export function registrarFalhaEmissao(mensagem: string, err: unknown): void {
  const severity = severidadeDaFalha(err)
  const detalhes = ehHttpsError(err)
    ? { codigo: err.code, codigoPlataforma: (err.details as { codigo?: unknown } | undefined)?.codigo ?? null }
    : {}
  logger.write({ severity, message: `${mensagem} ${textoSeguroParaLog(err)}`, ...detalhes })
}
