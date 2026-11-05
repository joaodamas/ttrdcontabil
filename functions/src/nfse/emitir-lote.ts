/**
 * Cloud Function: emissão de NFS-e em lote
 *
 * Recebe um array de EmitirNfseInput e processa cada um sequencialmente
 * (municípios rejeitam requisições paralelas do mesmo CNPJ).
 *
 * Retorna um array de ResultadoLote com o resultado individual de cada item.
 * Itens com erro não interrompem o lote — são marcados como falha.
 *
 * Limite: 50 notas por chamada.
 * Timeout: 540s (9 min) — máximo permitido pelo Gen 2.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { credentialSecrets } from './secrets'
import { assertCanAccessCliente } from '../authz'
import { processarEmissao } from './emitir'
import type { EmitirNfseInput } from './types'

const LOTE_MAX = 50

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EmitirLoteInput {
  itens: EmitirNfseInput[]
}

export interface ResultadoLote {
  index:     number
  clienteId: string
  sucesso:   boolean
  numeroNfse?: string
  erro?:     string
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const emitirNfseLote = onCall(
  {
    region:         'southamerica-east1',
    timeoutSeconds: 540,
    memory:         '512MiB',
    invoker:        'public',
    secrets:        credentialSecrets,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { itens } = request.data as EmitirLoteInput
    if (!Array.isArray(itens) || itens.length === 0) {
      throw new HttpsError('invalid-argument', 'Informe um array de itens.')
    }
    if (itens.length > LOTE_MAX) {
      throw new HttpsError('invalid-argument', `Máximo de ${LOTE_MAX} notas por lote.`)
    }

    const resultados: ResultadoLote[] = []

    for (let i = 0; i < itens.length; i++) {
      const input = itens[i]

      try {
        if (!input.clienteId) throw new Error('clienteId obrigatório.')
        if (!input.tomador)   throw new Error('Dados do tomador obrigatórios.')
        if (!input.servico)   throw new Error('Dados do serviço obrigatórios.')
        await assertCanAccessCliente(request.auth!.uid, input.clienteId, 'fiscal')

        // Mesmo caminho da emissão unitária: reserva e grava o RPS em transação
        // antes de enviar, para que o retry (consulta prévia por RPS) encontre a
        // nota em caso de timeout — sem isso o lote gerava RPS novo e duplicava.
        const resultado = await processarEmissao(input, request.auth!.uid, {
          extrasNotaEmitida: { loteIndex: i, emitidaEmLote: true },
        })

        resultados.push({
          index:     i,
          clienteId: input.clienteId,
          sucesso:   resultado.sucesso,
          numeroNfse: resultado.numeroNfse,
          erro:      resultado.erro,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        resultados.push({ index: i, clienteId: input.clienteId ?? '?', sucesso: false, erro: msg })
      }
    }

    const sucessos = resultados.filter((r) => r.sucesso).length
    const falhas   = resultados.length - sucessos
    console.log(`[emitir-lote] Processados: ${resultados.length} | Sucesso: ${sucessos} | Falhas: ${falhas}`)

    return { resultados, sucessos, falhas }
  }
)
