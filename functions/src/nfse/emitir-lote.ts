/**
 * Cloud Function: emissão de NFS-e em lote
 *
 * Recebe SÓ os ids dos rascunhos (`rascunhoIds`) e relê cada um do servidor
 * pelo normalizador único — o navegador não manda mais o payload da nota (M8:
 * antes emitia o que viesse no corpo da chamada, inclusive campos editados à
 * mão no console). Processa em sequência (um CNPJ por vez na Sefin).
 *
 * Tamanho e tempo: até LOTE_MAX notas por chamada e um orçamento de tempo —
 * cada nota pode levar ~2,5 min no pior caso (convênio + consulta prévia +
 * envio + reconciliação); quando o orçamento acaba, as restantes voltam como
 * "não processadas" (sem trava nem número consumido) para o usuário reenviar.
 *
 * Retorna um ResultadoLote por rascunho; falha de um item não interrompe o lote.
 */
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { credentialSecrets } from './secrets'
import { assertCanAccessCliente } from '../authz'
import { processarEmissao } from './emitir'
import { normalizarRascunho } from './normalizar-rascunho'

const db = () => admin.firestore()

export const LOTE_MAX = 25
const TIMEOUT_LOTE_S = 540
/** Não começa uma nota nova se sobrar menos que o pior caso de uma emissão (+ folga). */
const RESERVA_POR_NOTA_MS = 170_000

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EmitirLoteInput {
  rascunhoIds?: string[]
  /** Formato antigo (navegador em cache): só o rascunhoId de cada item é usado. */
  itens?: Array<{ rascunhoId?: unknown }>
}

export interface ResultadoLote {
  index:     number
  rascunhoId: string
  clienteId: string
  sucesso:   boolean
  numeroNfse?: string
  erro?:     string
  /** Não foi tentado nesta chamada (orçamento de tempo) — reenviar. */
  naoProcessado?: boolean
  /** A nota já existia (Sefin/histórico) e foi só registrada. */
  jaEmitida?: boolean
}

/** Ids do pedido, sem repetição; o formato antigo vale só pelos rascunhoIds. */
export function idsDoLote(data: EmitirLoteInput | undefined): string[] {
  const brutos = Array.isArray(data?.rascunhoIds)
    ? data!.rascunhoIds
    : Array.isArray(data?.itens) ? data!.itens.map((i) => i?.rascunhoId) : []
  const ids = brutos.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id))
  return Array.from(new Set(ids))
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const emitirNfseLote = onCall(
  {
    region:         'southamerica-east1',
    timeoutSeconds: TIMEOUT_LOTE_S,
    memory:         '512MiB',
    invoker:        'public',
    secrets:        credentialSecrets,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const uid = request.auth.uid
    const inicio = Date.now()

    const ids = idsDoLote(request.data as EmitirLoteInput)
    if (ids.length === 0) {
      throw new HttpsError('invalid-argument', 'Informe os rascunhos a emitir (rascunhoIds).')
    }
    if (ids.length > LOTE_MAX) {
      throw new HttpsError('invalid-argument', `Máximo de ${LOTE_MAX} notas por lote.`)
    }

    const resultados: ResultadoLote[] = []

    for (let i = 0; i < ids.length; i++) {
      const rascunhoId = ids[i]
      if (Date.now() - inicio > TIMEOUT_LOTE_S * 1000 - RESERVA_POR_NOTA_MS) {
        resultados.push({
          index: i, rascunhoId, clienteId: '?', sucesso: false, naoProcessado: true,
          erro: 'Não processada nesta rodada (tempo do lote esgotado) — nada foi enviado. Selecione de novo para emitir.',
        })
        continue
      }

      let clienteId = '?'
      try {
        const snap = await db().collection('nfse_rascunhos').doc(rascunhoId).get()
        if (!snap.exists) throw new Error('Rascunho não encontrado.')
        const data = snap.data() as Record<string, unknown>
        clienteId = (data.clienteId as string | undefined) ?? '?'
        await assertCanAccessCliente(uid, data.clienteId as string | undefined, 'fiscal')

        // Mesmo caminho da emissão unitária: trava o rascunho, reserva/reusa o
        // nDPS e consulta a Sefin antes de reenviar um número já usado.
        const resultado = await processarEmissao(normalizarRascunho(rascunhoId, data), uid, {
          extrasNotaEmitida: { loteIndex: i, emitidaEmLote: true },
        })

        resultados.push({
          index:     i,
          rascunhoId,
          clienteId,
          sucesso:   resultado.sucesso,
          numeroNfse: resultado.numeroNfse,
          erro:      resultado.erro,
          jaEmitida: resultado.jaEmitida,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        resultados.push({ index: i, rascunhoId, clienteId, sucesso: false, erro: msg })
      }
    }

    const sucessos = resultados.filter((r) => r.sucesso).length
    const naoProcessados = resultados.filter((r) => r.naoProcessado).length
    const falhas   = resultados.length - sucessos
    console.log(`[emitir-lote] Processados: ${resultados.length} | Sucesso: ${sucessos} | Falhas: ${falhas} | Não processados: ${naoProcessados}`)

    return { resultados, sucessos, falhas, naoProcessados }
  }
)
