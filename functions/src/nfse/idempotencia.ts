/**
 * Idempotência da emissão de NF-e/NFC-e (produto).
 *
 * Diferente da NFS-e, aqui não há rascunho nem RPS para servir de identidade da
 * nota — sem uma chave, duplo clique ou retry de rede emitiam duas notas reais.
 * O navegador gera uma chave por tentativa (UUID); ela trava a emissão no
 * Firestore e segue como integrationId para a Spedy, que permite reaproveitar a
 * nota já criada em vez de fazer um segundo POST.
 *
 * Funções puras — o acesso ao Firestore fica em emitir-produto.ts.
 */

/**
 * Processando há mais que isto = a execução anterior morreu. emitirNfeProduto
 * tem timeoutSeconds 120; morta por timeout, o catch não roda e a trava fica.
 */
export const TRAVA_PROCESSANDO_MAX_MS = 3 * 60_000

// Vira id de documento e integrationId (máx. 36 na Spedy): só [A-Za-z0-9-].
const CHAVE_RE = /^[A-Za-z0-9-]{16,36}$/

export function validarChaveIdempotencia(chave: unknown): chave is string {
  return typeof chave === 'string' && CHAVE_RE.test(chave)
}

export interface TravaEmissao {
  status: 'processando' | 'emitida' | 'erro'
  atualizadoEmMs: number
  notaId?: string
  numeroNfse?: string | null
}

export type DecisaoTrava =
  | { acao: 'emitir' }
  | { acao: 'bloquear' }
  | { acao: 'reaproveitar'; notaId: string; numeroNfse: string | null }

export function decidirTravaEmissao(trava: TravaEmissao | null, agoraMs: number): DecisaoTrava {
  if (!trava) return { acao: 'emitir' }
  if (trava.status === 'emitida' && trava.notaId) {
    return { acao: 'reaproveitar', notaId: trava.notaId, numeroNfse: trava.numeroNfse ?? null }
  }
  if (trava.status === 'processando' && agoraMs - trava.atualizadoEmMs < TRAVA_PROCESSANDO_MAX_MS) {
    return { acao: 'bloquear' }
  }
  return { acao: 'emitir' }
}
