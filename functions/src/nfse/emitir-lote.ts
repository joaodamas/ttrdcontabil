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
import { decrypt, isEncrypted } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { assertCaminhoCertificado, pfxBase64FromStorageBuffer } from './certificado'
import { assertCanAccessCliente } from '../authz'
import { validarPayloadFiscal } from './validacao'
import { requireEnvironmentTenant } from '../tenant'
import { writeAuditLog } from '../audit'
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

function resumoNfseInput(input: EmitirNfseInput) {
  return {
    clienteId: input.clienteId,
    rascunhoId: input.rascunhoId ?? null,
    competenciaId: input.competenciaId ?? null,
    tomadorNome: input.tomador?.razaoSocial ?? null,
    tomadorDocumentoFinal: input.tomador?.cpfCnpj ? String(input.tomador.cpfCnpj).replace(/\D/g, '').slice(-4) : null,
    codigoServico: input.servico?.codigoServico ?? null,
    valorServico: input.servico?.valorServico ?? null,
    issRetido: input.servico?.issRetido ?? null,
  }
}

function resumoTentativaNfse(input: EmitirNfseInput, config: ConfigFiscalCliente) {
  return {
    ...resumoNfseInput(input),
    municipioIbge: config.municipioIbge,
    ambienteEmissao: config.ambienteEmissao,
  }
}

// ─── Helpers (replicados de emitir.ts para evitar acoplamento de imports) ─────

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId).limit(1).get()
  if (snap.empty) throw new Error(`Configuração fiscal não encontrada para cliente ${clienteId}.`)
  const data = snap.docs[0].data()
  return { clienteId, ...data, tenantId: requireEnvironmentTenant(data.tenantId, 'Configuração fiscal') } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new Error(`Cliente ${clienteId} não encontrado.`)
  return { id: doc.id, ...doc.data() } as Record<string, unknown>
}

function decryptSenhaCertificado(senhaRaw: string | undefined): string {
  if (!senhaRaw) return ''
  if (!isEncrypted(senhaRaw)) {
    throw new Error('Senha do certificado em formato legado não criptografado. Reenvie o certificado A1 para salvar a credencial com criptografia.')
  }

  const senha = decrypt(senhaRaw)
  if (!senha) {
    throw new Error('Não foi possível descriptografar a senha do certificado. Verifique o secret CREDENTIAL_KEY e reenvie o certificado A1.')
  }
  return senha
}

async function getCertificado(config: ConfigFiscalCliente): Promise<CertificadoA1 | undefined> {
  const pathPersistido = config.credenciais?.certificadoStoragePath
  // Nunca baixa pelo campo cru — ver a armadilha em certificado.ts. Cliente sem
  // certificado continua sendo caminho válido e segue sem A1.
  if (!pathPersistido) return undefined
  const path = assertCaminhoCertificado(config.clienteId, pathPersistido)
  const file = getStorage().bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()
  return {
    pfxBase64: pfxBase64FromStorageBuffer(buffer),
    senha:     decryptSenhaCertificado(config.credenciais?.certificadoSenha as string | undefined),
  }
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
        await assertCanAccessCliente(request.auth!.uid, input.clienteId, 'fiscal')

        if (input.rascunhoId) {
          const rascunhoRef = db().collection('nfse_rascunhos').doc(input.rascunhoId)
          await db().runTransaction(async (tx) => {
            const rascunho = await tx.get(rascunhoRef)
            if (!rascunho.exists) throw new Error('Rascunho não encontrado.')
            const status = rascunho.data()?.status as string | undefined
            if (status === 'emitida') throw new Error('Rascunho já emitido.')
            if (status === 'processando') throw new Error('Rascunho já está em processamento.')
            tx.update(rascunhoRef, {
              status: 'processando',
              atualizadoEm: now,
              atualizadoPorId: request.auth!.uid,
            })
          })
        }

        // Config fiscal (cache)
        if (!configCache.has(input.clienteId)) {
          configCache.set(input.clienteId, await getConfigFiscal(input.clienteId))
        }
        const config = configCache.get(input.clienteId)!
        const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')
        if (config.ambienteEmissao === 'producao' && !(await isProducaoLiberadaPorConfigOuConector(config, 'emissao'))) {
          throw new Error('Município/configuração fiscal ainda não liberado para emissão em produção.')
        }

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

        const errosValidacao = validarPayloadFiscal(input, config, prestador)
        if (errosValidacao.length > 0) {
          throw new Error(`Payload fiscal inválido: ${errosValidacao.join(' ')}`)
        }

        const resultado: ResultadoEmissao = await rotearEmissao(input, config, prestador, cert)

        if (resultado.sucesso) {
          await db().collection('nfse_emitidas').add({
            tenantId:          config.tenantId,
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
              status: 'emitida',
              erroUltimaTentativa: null,
              codigoErroUltimaTentativa: null,
              detalhesUltimaTentativa: null,
              requestResumoUltimaTentativa: null,
              ultimaTentativaEm: now,
              atualizadoEm: now,
            })
          }
          await writeAuditLog({
            tenantId,
            actor: { id: request.auth!.uid, nome: 'Usuário autenticado' },
            entidade: 'nfse_emitidas',
            entidadeId: resultado.numeroNfse ?? input.rascunhoId ?? null,
            acao: 'emissao_nfse_lote_sucesso',
            dadosDepois: {
              ...resumoNfseInput(input),
              loteIndex: i,
              numeroNfse: resultado.numeroNfse ?? null,
              municipioIbge: config.municipioIbge,
              ambienteEmissao: config.ambienteEmissao,
            },
            origem: 'cloud_function',
          })
        } else {
          const erroRef = await db().collection('nfse_erros').add({
            tenantId:    config.tenantId,
            clienteId:   input.clienteId,
            clienteNome: cliente.razaoSocial as string,
            erro:        resultado.erro,
            detalhes:    resultado.detalhes ?? null,
            inputResumo: resumoNfseInput(input),
            criadoEm:    now,
            criadoPorId: request.auth!.uid,
            loteIndex:   i,
          })

          if (input.rascunhoId) {
            await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
              status: 'erro_integracao',
              erroId: erroRef.id,
              erroUltimaTentativa: resultado.erro ?? 'Erro não informado pelo conector.',
              codigoErroUltimaTentativa: resultado.codigoErro ?? null,
              detalhesUltimaTentativa: resultado.detalhes ?? null,
              requestResumoUltimaTentativa: resumoTentativaNfse(input, config),
              ultimaTentativaEm: now,
              atualizadoEm: Timestamp.now(),
              atualizadoPorId: request.auth!.uid,
            })
          }
          await writeAuditLog({
            tenantId,
            actor: { id: request.auth!.uid, nome: 'Usuário autenticado' },
            entidade: 'nfse_erros',
            entidadeId: erroRef.id,
            acao: 'emissao_nfse_lote_erro',
            dadosDepois: {
              ...resumoNfseInput(input),
              loteIndex: i,
              erro: resultado.erro ?? 'Erro não informado pelo conector.',
              codigoErro: resultado.codigoErro ?? null,
              municipioIbge: config.municipioIbge,
              ambienteEmissao: config.ambienteEmissao,
            },
            origem: 'cloud_function',
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
        if (input?.rascunhoId) {
          await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
            status: 'erro_integracao',
            erroUltimaTentativa: msg,
            codigoErroUltimaTentativa: null,
            detalhesUltimaTentativa: null,
            requestResumoUltimaTentativa: input ? resumoNfseInput(input) : null,
            ultimaTentativaEm: Timestamp.now(),
            atualizadoEm: Timestamp.now(),
            atualizadoPorId: request.auth!.uid,
          }).catch((updateErr) => {
            console.error('[emitir-lote] Falha ao destravar rascunho com erro:', updateErr)
          })
        }
        resultados.push({ index: i, clienteId: input.clienteId ?? '?', sucesso: false, erro: msg })
      }
    }

    const sucessos = resultados.filter((r) => r.sucesso).length
    const falhas   = resultados.length - sucessos
    console.log(`[emitir-lote] Processados: ${resultados.length} | Sucesso: ${sucessos} | Falhas: ${falhas}`)

    return { resultados, sucessos, falhas }
  }
)
