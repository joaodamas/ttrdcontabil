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
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { rotearEmissao } from './municipios/router'
import { decrypt } from './encrypt'
import type {
  EmitirNfseInput, ConfigFiscalCliente, Prestador, CertificadoA1, ResultadoEmissao,
} from './types'

const db = () => admin.firestore()

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

// ─── Helpers (replicados de emitir.ts para evitar acoplamento de imports) ─────

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId).limit(1).get()
  if (snap.empty) throw new Error(`Configuração fiscal não encontrada para cliente ${clienteId}.`)
  return { clienteId, ...snap.docs[0].data() } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new Error(`Cliente ${clienteId} não encontrado.`)
  return { id: doc.id, ...doc.data() } as Record<string, unknown>
}

async function getCertificado(config: ConfigFiscalCliente): Promise<CertificadoA1 | undefined> {
  const path = config.credenciais?.certificadoStoragePath
  if (!path) return undefined
  const file = getStorage().bucket().file(path as string)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()
  const senhaRaw = config.credenciais?.certificadoSenha as string | undefined
  return {
    pfxBase64: buffer.toString('base64'),
    senha:     senhaRaw ? (decrypt(senhaRaw) ?? senhaRaw) : '',
  }
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const emitirNfseLote = onCall(
  {
    region:         'southamerica-east1',
    timeoutSeconds: 540,
    memory:         '512MiB',
    invoker:        'public',
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
    const now = Timestamp.now()

    // Cache por clienteId para evitar buscas repetidas no mesmo lote
    const configCache  = new Map<string, ConfigFiscalCliente>()
    const clienteCache = new Map<string, Record<string, unknown>>()
    const certCache    = new Map<string, CertificadoA1 | undefined>()

    for (let i = 0; i < itens.length; i++) {
      const input = itens[i]

      try {
        if (!input.clienteId) throw new Error('clienteId obrigatório.')
        if (!input.tomador)   throw new Error('Dados do tomador obrigatórios.')
        if (!input.servico)   throw new Error('Dados do serviço obrigatórios.')

        // Config fiscal (cache)
        if (!configCache.has(input.clienteId)) {
          configCache.set(input.clienteId, await getConfigFiscal(input.clienteId))
        }
        const config = configCache.get(input.clienteId)!

        // Dados do cliente (cache)
        if (!clienteCache.has(input.clienteId)) {
          clienteCache.set(input.clienteId, await getCliente(input.clienteId))
        }
        const cliente = clienteCache.get(input.clienteId)!

        // Certificado (cache)
        if (!certCache.has(input.clienteId)) {
          certCache.set(input.clienteId, await getCertificado(config))
        }
        const cert = certCache.get(input.clienteId)

        const prestador: Prestador = {
          cnpj:               (cliente.cpfCnpj as string).replace(/\D/g, ''),
          inscricaoMunicipal:  config.inscricaoMunicipal,
          razaoSocial:         cliente.razaoSocial as string,
          municipioIbge:       config.municipioIbge,
        }

        const resultado: ResultadoEmissao = await rotearEmissao(input, config, prestador, cert)

        if (resultado.sucesso) {
          await db().collection('nfse_emitidas').add({
            clienteId:         input.clienteId,
            clienteNome:       cliente.razaoSocial as string,
            competenciaId:     input.competenciaId ?? null,
            rascunhoId:        input.rascunhoId ?? null,
            tomadorNome:       input.tomador.razaoSocial,
            tomadorCpfCnpj:    input.tomador.cpfCnpj,
            descricaoServico:  input.servico.discriminacao,
            codigoServico:     input.servico.codigoServico,
            valorServico:      input.servico.valorServico,
            aliquota:          input.servico.aliquota ?? config.aliquotaPadrao ?? null,
            issRetido:         input.servico.issRetido,
            numeroNfse:        resultado.numeroNfse ?? null,
            codigoVerificacao: resultado.codigoVerificacao ?? null,
            xmlNfse:           resultado.xmlNfse ?? null,
            municipioIbge:     config.municipioIbge,
            municipioNome:     config.municipioEmissor,
            status:            'emitida',
            dataEmissao:       now,
            criadoEm:          now,
            criadoPorId:       request.auth!.uid,
            ambienteEmissao:   config.ambienteEmissao,
            loteIndex:         i,
            emitidaEmLote:     true,
          })

          if (input.rascunhoId) {
            await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
              status: 'emitida', atualizadoEm: now,
            })
          }
        } else {
          await db().collection('nfse_erros').add({
            clienteId:   input.clienteId,
            clienteNome: cliente.razaoSocial as string,
            erro:        resultado.erro,
            detalhes:    resultado.detalhes ?? null,
            input:       JSON.stringify(input),
            criadoEm:    now,
            criadoPorId: request.auth!.uid,
            loteIndex:   i,
          })
        }

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
