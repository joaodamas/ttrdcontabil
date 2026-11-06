/**
 * Regras PURAS da orquestração de emissão (sem firebase-admin — testáveis no
 * vitest): trava do rascunho, chave de idempotência do formulário, transição
 * de status na consulta e motivo de cancelamento.
 */

// ─── Trava do rascunho ('processando') ──────────────────────────────────────

/**
 * Validade da trava de um envio. Precisa passar do pior caso de UMA emissão
 * (convênio 8 s + consulta prévia 20 s + envio 90 s + reconciliação de E0014
 * 20 s + gravações ≈ 2,5 min) e ficar abaixo do intervalo da rotina de
 * reconciliação (15 min). Passou disso sem a function liberar = ela morreu no
 * meio; outra tentativa (ou a rotina) pode assumir — e, como o nDPS já está
 * gravado, a primeira coisa que faz é consultar a Sefin.
 */
export const TRAVA_EMISSAO_MS = 6 * 60_000

/** Rascunho 'processando' antigo, sem `travaExpiraEm` (gravado antes desta versão). */
export const TRAVA_LEGADA_MS = 30 * 60_000

export type DecisaoTrava =
  | { pode: true; assumiuTravaVencida: boolean }
  | { pode: false; motivo: 'emitida' | 'processando' }

/** O rascunho pode ser travado para um novo envio agora? */
export function avaliarTrava(
  rascunho: { status?: unknown; travaExpiraEmMs?: number | null; atualizadoEmMs?: number | null },
  agoraMs: number,
): DecisaoTrava {
  if (rascunho.status === 'emitida') return { pode: false, motivo: 'emitida' }
  if (rascunho.status !== 'processando') return { pode: true, assumiuTravaVencida: false }
  if (travaVencida(rascunho, agoraMs)) return { pode: true, assumiuTravaVencida: true }
  return { pode: false, motivo: 'processando' }
}

export function travaVencida(
  rascunho: { travaExpiraEmMs?: number | null; atualizadoEmMs?: number | null },
  agoraMs: number,
): boolean {
  if (typeof rascunho.travaExpiraEmMs === 'number') return rascunho.travaExpiraEmMs <= agoraMs
  // Legado sem trava gravada: mesmo critério do alerta diário antigo (30 min).
  if (typeof rascunho.atualizadoEmMs === 'number') return agoraMs - rascunho.atualizadoEmMs >= TRAVA_LEGADA_MS
  return true
}

// ─── Chave de idempotência do formulário ────────────────────────────────────

const PADRAO_CHAVE = /^[A-Za-z0-9_-]{16,64}$/

export function chaveIdempotenciaValida(v: unknown): v is string {
  return typeof v === 'string' && PADRAO_CHAVE.test(v)
}

/**
 * Id do rascunho criado pelo servidor para uma emissão direta (sem rascunho
 * salvo). Determinístico pela chave que o formulário gera UMA vez por nota:
 * o segundo clique (ou o reenvio depois de um timeout) cai no MESMO rascunho,
 * portanto no MESMO nDPS — nunca numa segunda nota.
 */
export function idRascunhoEmissaoDireta(chave: string): string {
  if (!chaveIdempotenciaValida(chave)) throw new Error('Chave de idempotência inválida.')
  return `emissao_${chave}`
}

// ─── Status da nota depois de uma consulta ──────────────────────────────────

/**
 * Status gravado em nfse_emitidas depois de uma consulta bem-sucedida.
 * Nunca regride: nota cancelada continua cancelada mesmo que a consulta não
 * traga o evento (a Sefin pode devolver só o XML da NFS-e, que não muda com o
 * cancelamento); cancelamento pendente só sai para 'cancelada'.
 */
export function statusAposConsulta(atual: unknown, retornado: unknown): string {
  const a = typeof atual === 'string' ? atual : undefined
  const r = typeof retornado === 'string' ? retornado : undefined
  if (a === 'cancelada') return 'cancelada'
  if (r === 'cancelada') return 'cancelada'
  if (a === 'cancelamento_pendente') return 'cancelamento_pendente'
  return r ?? a ?? 'emitida'
}

// ─── Cancelamento ───────────────────────────────────────────────────────────

/** O Ambiente Nacional exige xMotivo com 15 a 255 caracteres. */
export const MOTIVO_CANCELAMENTO_MIN = 15
export const MOTIVO_CANCELAMENTO_MAX = 255

export function validarMotivoCancelamento(motivo: unknown): string | null {
  const m = typeof motivo === 'string' ? motivo.trim() : ''
  if (m.length < MOTIVO_CANCELAMENTO_MIN) {
    return `Informe um motivo de cancelamento com pelo menos ${MOTIVO_CANCELAMENTO_MIN} caracteres.`
  }
  if (m.length > MOTIVO_CANCELAMENTO_MAX) {
    return `O motivo de cancelamento pode ter no máximo ${MOTIVO_CANCELAMENTO_MAX} caracteres.`
  }
  return null
}
