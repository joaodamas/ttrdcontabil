import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { processarEmissao } from './emitir'
import { rotearCancelamento, rotearConsulta } from './municipios/router'
import { credentialSecrets } from './secrets'
import { assertCanAccessCliente } from '../authz'
import { gerarESalvarDanfse } from './danfse/servico'
import { redactAuditData, writeAuditLog } from '../audit'
import { getConfigFiscal, montarContextoFiscal } from './contexto'
import { normalizarRascunho } from './normalizar-rascunho'
import { resolverProvedorNfse } from './provedor'
import { statusAposConsulta, validarMotivoCancelamento } from './regras-emissao'
import type { EmitirNfseInput } from './types'

export { normalizarRascunho } from './normalizar-rascunho'

const db = () => admin.firestore()

type FunctionStatus = 'success' | 'error' | 'processing'

type StandardResponse<T = Record<string, unknown>> = {
  status: FunctionStatus
  message: string
  data?: T
  errorCode?: string
}

function ok<T extends Record<string, unknown>>(message: string, data?: T): StandardResponse<T> {
  return { status: 'success', message, data }
}

function processing<T extends Record<string, unknown>>(message: string, data?: T): StandardResponse<T> {
  return { status: 'processing', message, data }
}

function error(message: string, errorCode?: string, data?: Record<string, unknown>): StandardResponse {
  return { status: 'error', message, errorCode, data }
}

async function registrarEvento(
  nfseId: string,
  tipo: string,
  uid: string,
  mensagem: string,
  detalhes?: Record<string, unknown>,
  contexto?: { tenantId?: string; clienteId?: string },
) {
  await db().collection('nfse_eventos').add({
    tenantId: contexto?.tenantId,
    clienteId: contexto?.clienteId,
    nfseId,
    tipo,
    mensagem,
    detalhes: detalhes ? redactAuditData(detalhes) : null,
    actorId: uid,
    origem: 'cloud_function',
    criadoEm: Timestamp.now(),
  })
}

async function auditarAcaoFiscal(params: {
  tenantId?: string
  uid: string
  entidadeId: string
  acao: string
  dadosDepois: Record<string, unknown>
}) {
  if (!params.tenantId) return
  await writeAuditLog({
    tenantId: params.tenantId,
    actor: { id: params.uid, nome: 'Usuário autenticado' },
    entidade: 'nfse_emitidas',
    entidadeId: params.entidadeId,
    acao: params.acao,
    dadosDepois: params.dadosDepois,
    origem: 'cloud_function',
  })
}

/**
 * Consulta prévia do RPS antes do retry — só para o webservice da PREFEITURA
 * (legado). No Ambiente Nacional quem consulta a DPS antes de reenviar é o
 * próprio processarEmissao, que além disso REGISTRA a nota encontrada.
 */
async function consultarRpsAntesRetry(
  input: EmitirNfseInput,
  uid: string,
  contexto: { tenantId?: string; clienteId?: string },
): Promise<StandardResponse | null> {
  if (!input.numeroRps) {
    throw new HttpsError(
      'failed-precondition',
      'Retry fiscal bloqueado: o rascunho não possui RPS persistido para consulta prévia na prefeitura.'
    )
  }
  if (!contexto.tenantId) {
    throw new HttpsError('failed-precondition', 'Retry fiscal bloqueado: rascunho sem tenantId.')
  }

  let existenteQuery = db()
    .collection('nfse_emitidas')
    .where('tenantId', '==', contexto.tenantId)
    .where('clienteId', '==', input.clienteId)
    .where('numeroRps', '==', input.numeroRps)
    .limit(1)

  if (input.serieRps) {
    existenteQuery = db()
      .collection('nfse_emitidas')
      .where('tenantId', '==', contexto.tenantId)
      .where('clienteId', '==', input.clienteId)
      .where('numeroRps', '==', input.numeroRps)
      .where('serieRps', '==', input.serieRps)
      .limit(1)
  }

  const existente = await existenteQuery.get()
  if (!existente.empty) {
    const doc = existente.docs[0]
    await registrarEvento(input.rascunhoId ?? doc.id, 'retry_bloqueado_rps_existente', uid, 'Retry bloqueado: RPS já existe no histórico interno.', {
      nfseId: doc.id,
      numeroRps: input.numeroRps,
      serieRps: input.serieRps ?? null,
    }, contexto)
    return ok('Retry bloqueado: este RPS já possui NFS-e no histórico interno.', { id: doc.id })
  }

  const { config, prestador, cert } = await montarContextoFiscal(input.clienteId, 'consulta')
  const resultadoConsulta = await rotearConsulta({
    nfseId: input.rascunhoId ?? input.numeroRps,
    clienteId: input.clienteId,
    numeroRps: input.numeroRps,
    serieRps: input.serieRps,
    rascunhoId: input.rascunhoId,
  }, config, prestador, cert)

  await registrarEvento(input.rascunhoId ?? input.numeroRps, 'retry_consulta_rps', uid, 'Consulta prévia por RPS executada antes do retry.', {
    numeroRps: input.numeroRps,
    serieRps: input.serieRps ?? null,
    resultado: resultadoConsulta,
  }, contexto)

  if (!resultadoConsulta.sucesso) {
    throw new HttpsError(
      'failed-precondition',
      resultadoConsulta.erro ?? 'Retry fiscal bloqueado: não foi possível consultar o RPS antes de tentar nova emissão.'
    )
  }

  if (resultadoConsulta.status && resultadoConsulta.status !== 'erro' && resultadoConsulta.status !== 'rejeitada') {
    return processing(resultadoConsulta.mensagem ?? 'Retry interrompido: prefeitura já possui status para este RPS.', {
      statusPrefeitura: resultadoConsulta.status,
      numeroNfse: resultadoConsulta.numeroNfse ?? null,
      codigoVerificacao: resultadoConsulta.codigoVerificacao ?? null,
      numeroRps: input.numeroRps,
      serieRps: input.serieRps ?? null,
    })
  }

  return null
}

export const consultarNfse = onCall(
  // Consulta + eventos: até 2 × 20 s (PRAZOS_NACIONAL_MS.consulta).
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', invoker: 'public', secrets: credentialSecrets },
  async (request): Promise<StandardResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { nfseId } = request.data as { nfseId?: string }
    if (!nfseId) throw new HttpsError('invalid-argument', 'nfseId obrigatório.')

    const ref = db().collection('nfse_emitidas').doc(nfseId)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpsError('not-found', 'NFS-e não encontrada.')

    const data = { id: snap.id, ...snap.data() } as Record<string, unknown>
    await assertCanAccessCliente(request.auth.uid, data.clienteId as string | undefined, 'fiscal')
    const { config, prestador, cert } = await montarContextoFiscal(data.clienteId as string | undefined, 'consulta')
    const resultado = await rotearConsulta({
      nfseId,
      clienteId: data.clienteId as string,
      numeroNfse: data.numeroNfse as string | undefined,
      codigoVerificacao: (data.chaveAcesso ?? data.codigoVerificacao) as string | undefined,
      numeroRps: data.numeroRps as string | undefined,
      serieRps: data.serieRps as string | undefined,
      rascunhoId: data.rascunhoId as string | undefined,
    }, config, prestador, cert)

    await registrarEvento(nfseId, 'consulta_status', request.auth.uid, 'Consulta de status executada.', {
      statusAnterior: data.status,
      resultado,
    }, { tenantId: data.tenantId as string | undefined, clienteId: data.clienteId as string | undefined })
    await auditarAcaoFiscal({
      tenantId: data.tenantId as string | undefined,
      uid: request.auth.uid,
      entidadeId: nfseId,
      acao: 'consulta_nfse',
      dadosDepois: {
        clienteId: data.clienteId,
        statusAnterior: data.status,
        statusRetornado: resultado.status ?? null,
        sucesso: resultado.sucesso,
        codigoErro: resultado.codigoErro ?? null,
      },
    })

    if (!resultado.sucesso) {
      await ref.update({
        erroUltimaConsulta: resultado.erro ?? null,
        codigoErroUltimaConsulta: resultado.codigoErro ?? null,
        atualizadoEm: Timestamp.now(),
      })
      return error(resultado.erro ?? 'Consulta fiscal falhou.', resultado.codigoErro, { id: nfseId })
    }

    // Grava em transação com a guarda de status (A3): nota cancelada nunca
    // volta a 'emitida' por uma consulta que não trouxe o evento, e um
    // cancelamento confirmado pela Sefin é refletido.
    const updates = await db().runTransaction(async (tx) => {
      const atual = await tx.get(ref)
      const statusAtual = atual.data()?.status
      const novoStatus = statusAposConsulta(statusAtual, resultado.status)
      const u: Record<string, unknown> = {
        status: novoStatus,
        ultimaConsultaEm: Timestamp.now(),
        erroUltimaConsulta: null,
        codigoErroUltimaConsulta: null,
        atualizadoEm: Timestamp.now(),
      }
      if (novoStatus === 'cancelada' && statusAtual !== 'cancelada') {
        u.canceladoEm = Timestamp.now()
        u.canceladaConfirmadaPorConsulta = true
      }
      if (resultado.xmlNfse) u.xmlNfse = resultado.xmlNfse
      if (resultado.pdfUrl) u.pdfUrl = resultado.pdfUrl
      if (resultado.numeroNfse && !atual.data()?.numeroNfse) u.numeroNfse = resultado.numeroNfse
      if (resultado.chaveAcesso && !atual.data()?.chaveAcesso) u.chaveAcesso = resultado.chaveAcesso
      tx.update(ref, u)
      return u
    })

    if (updates.status === 'processando') {
      return processing(resultado.mensagem ?? 'NFS-e ainda em processamento.', { id: nfseId, ...updates })
    }

    return ok(resultado.mensagem ?? 'Status consultado com sucesso.', { id: nfseId, ...updates })
  }
)

export const cancelarNfse = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB', invoker: 'public', secrets: credentialSecrets },
  async (request): Promise<StandardResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { nfseId, motivo } = request.data as { nfseId?: string; motivo?: string }
    if (!nfseId) throw new HttpsError('invalid-argument', 'nfseId obrigatório.')
    // 15 a 255 caracteres: exigência do Ambiente Nacional (xMotivo) — antes o
    // servidor aceitava 10 e a Sefin recusava depois.
    const erroMotivo = validarMotivoCancelamento(motivo)
    if (erroMotivo) throw new HttpsError('invalid-argument', erroMotivo)
    const motivoLimpo = String(motivo).trim()

    const ref = db().collection('nfse_emitidas').doc(nfseId)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpsError('not-found', 'NFS-e não encontrada.')

    const nota = snap.data() as Record<string, unknown>
    await assertCanAccessCliente(request.auth.uid, nota.clienteId as string | undefined, 'fiscal')
    if (nota.status === 'cancelada') return ok('NFS-e já está cancelada.', { id: nfseId })
    if (nota.status !== 'emitida') {
      throw new HttpsError('failed-precondition', 'Apenas NFS-e emitida pode entrar em cancelamento.')
    }

    const { config, prestador, cert } = await montarContextoFiscal(nota.clienteId as string | undefined, 'cancelamento')
    const resultado = await rotearCancelamento({
      nfseId,
      clienteId: nota.clienteId as string,
      numeroNfse: nota.numeroNfse as string | undefined,
      codigoVerificacao: (nota.chaveAcesso ?? nota.codigoVerificacao) as string | undefined,
      numeroRps: nota.numeroRps as string | undefined,
      serieRps: nota.serieRps as string | undefined,
      rascunhoId: nota.rascunhoId as string | undefined,
      motivo: motivoLimpo,
    }, config, prestador, cert)

    if (!resultado.sucesso) {
      await ref.update({
        erroUltimaTentativa: resultado.erro ?? 'Cancelamento fiscal falhou.',
        codigoErroUltimaTentativa: resultado.codigoErro ?? null,
        tentativasCancelamento: FieldValue.increment(1),
        atualizadoEm: Timestamp.now(),
      })
      await registrarEvento(nfseId, 'cancelamento_erro', request.auth.uid, resultado.erro ?? 'Cancelamento fiscal falhou.', {
        motivo: motivoLimpo,
        codigoErro: resultado.codigoErro ?? null,
        detalhes: resultado.detalhes ?? null,
      }, { tenantId: nota.tenantId as string | undefined, clienteId: nota.clienteId as string | undefined })
      await auditarAcaoFiscal({
        tenantId: nota.tenantId as string | undefined,
        uid: request.auth.uid,
        entidadeId: nfseId,
        acao: 'cancelamento_nfse_erro',
        dadosDepois: {
          clienteId: nota.clienteId,
          codigoErro: resultado.codigoErro ?? null,
          erro: resultado.erro ?? null,
        },
      })
      return error(resultado.erro ?? 'Cancelamento fiscal falhou.', resultado.codigoErro, { id: nfseId })
    }

    await ref.update({
      status: resultado.status === 'processando' ? 'cancelamento_pendente' : 'cancelada',
      motivoCancelamento: motivoLimpo,
      cancelamentoSolicitadoEm: Timestamp.now(),
      cancelamentoSolicitadoPorId: request.auth.uid,
      canceladoEm: resultado.status === 'cancelada' ? Timestamp.now() : null,
      tentativasCancelamento: FieldValue.increment(1),
      erroUltimaTentativa: null,
      codigoErroUltimaTentativa: null,
      atualizadoEm: Timestamp.now(),
    })
    await registrarEvento(nfseId, 'cancelamento_solicitado', request.auth.uid, resultado.mensagem ?? 'Cancelamento solicitado.', {
      motivo: motivoLimpo,
      resultado,
    }, { tenantId: nota.tenantId as string | undefined, clienteId: nota.clienteId as string | undefined })
    await auditarAcaoFiscal({
      tenantId: nota.tenantId as string | undefined,
      uid: request.auth.uid,
      entidadeId: nfseId,
      acao: 'cancelamento_nfse_solicitado',
      dadosDepois: {
        clienteId: nota.clienteId,
        statusRetornado: resultado.status ?? null,
        sucesso: resultado.sucesso,
      },
    })

    if (resultado.status === 'processando') {
      return processing(resultado.mensagem ?? 'Cancelamento enviado para processamento fiscal.', { id: nfseId })
    }

    // DANFSe com a marca d'água "CANCELADA" (NT 008/2026, item 2.5.1).
    // Best-effort: o cancelamento já valeu; o PDF também sai pelo gerarDanfse.
    if (nota.xmlNfse) {
      await gerarESalvarDanfse(nfseId).catch((err) => {
        console.warn('[cancelarNfse] DANFSe cancelado não gerado:', err instanceof Error ? err.message : err)
      })
    }

    return ok(resultado.mensagem ?? 'NFS-e cancelada com sucesso.', { id: nfseId })
  }
)

export const retryNfse = onCall(
  // Mesmo orçamento da emissão (consulta prévia + envio + reconciliação).
  { region: 'southamerica-east1', timeoutSeconds: 300, memory: '512MiB', invoker: 'public', secrets: credentialSecrets },
  async (request): Promise<StandardResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { rascunhoId, erroId } = request.data as { rascunhoId?: string; erroId?: string }
    let input: EmitirNfseInput | null = null
    let retryContext: { tenantId?: string; clienteId?: string } = {}

    if (rascunhoId) {
      const snap = await db().collection('nfse_rascunhos').doc(rascunhoId).get()
      if (!snap.exists) throw new HttpsError('not-found', 'Rascunho não encontrado.')
      await assertCanAccessCliente(request.auth.uid, snap.data()?.clienteId as string | undefined, 'fiscal')
      input = normalizarRascunho(snap.id, snap.data() as Record<string, unknown>)
      retryContext = {
        tenantId: snap.data()?.tenantId as string | undefined,
        clienteId: snap.data()?.clienteId as string | undefined,
      }
    } else if (erroId) {
      const snap = await db().collection('nfse_erros').doc(erroId).get()
      if (!snap.exists) throw new HttpsError('not-found', 'Erro de NFS-e não encontrado.')
      const rascunhoDoErro = snap.data()?.rascunhoId as string | undefined
      const raw = (snap.data()?.input as string | undefined) ?? ''
      if (!raw && !rascunhoDoErro) {
        throw new HttpsError('failed-precondition', 'Retry por erro legado indisponível. Reemita a partir do rascunho NFS-e.')
      }
      if (rascunhoDoErro) {
        // Erro com rascunho: o retry é SEMPRE pelo rascunho (mesmo nDPS).
        const rSnap = await db().collection('nfse_rascunhos').doc(rascunhoDoErro).get()
        if (!rSnap.exists) throw new HttpsError('not-found', 'Rascunho do erro não encontrado.')
        await assertCanAccessCliente(request.auth.uid, rSnap.data()?.clienteId as string | undefined, 'fiscal')
        input = normalizarRascunho(rSnap.id, rSnap.data() as Record<string, unknown>)
      } else {
        input = JSON.parse(raw) as EmitirNfseInput
        await assertCanAccessCliente(request.auth.uid, input.clienteId, 'fiscal')
      }
      retryContext = {
        tenantId: snap.data()?.tenantId as string | undefined,
        clienteId: input.clienteId,
      }
    }

    if (!input) throw new HttpsError('invalid-argument', 'Informe rascunhoId ou erroId.')

    const provedor = resolverProvedorNfse(await getConfigFiscal(input.clienteId))
    if (provedor === 'nacional') {
      // Sem rascunho não há nDPS reservado para reusar: reemitir geraria número
      // novo — e, se a primeira tentativa saiu, uma segunda nota.
      if (!input.rascunhoId) {
        throw new HttpsError('failed-precondition', 'Este erro não tem rascunho com o número da DPS reservado. Confira o histórico de notas antes de emitir de novo.')
      }
      // A consulta prévia (GET /dps/{id}) e o registro da nota encontrada
      // acontecem dentro de processarEmissao.
    } else {
      const retryBloqueadoOuEncontrado = await consultarRpsAntesRetry(input, request.auth.uid, retryContext)
      if (retryBloqueadoOuEncontrado) return retryBloqueadoOuEncontrado
    }

    const resultado = await processarEmissao(input, request.auth.uid)
    if (!resultado.sucesso) {
      if (input.rascunhoId) {
        await registrarEvento(input.rascunhoId, 'retry_erro', request.auth.uid, resultado.erro ?? 'Retry falhou.', {
          codigoErro: resultado.codigoErro ?? null,
        }, retryContext)
      }
      await auditarAcaoFiscal({
        tenantId: retryContext.tenantId,
        uid: request.auth.uid,
        entidadeId: rascunhoId ?? erroId ?? input.clienteId,
        acao: 'retry_nfse_erro',
        dadosDepois: {
          clienteId: input.clienteId,
          rascunhoId: input.rascunhoId ?? null,
          erroId: erroId ?? null,
          codigoErro: resultado.codigoErro ?? null,
          erro: resultado.erro ?? null,
        },
      })
      return { status: 'error', message: resultado.erro ?? 'Retry falhou.', data: { resultado }, errorCode: resultado.codigoErro }
    }

    if (input.rascunhoId) {
      await registrarEvento(input.rascunhoId, resultado.reconciliada ? 'retry_reconciliado' : 'retry_sucesso', request.auth.uid,
        resultado.reconciliada ? 'Nota já existia na Sefin — registrada sem reenviar.' : 'Retry emitido com sucesso.', {
          numeroNfse: resultado.numeroNfse ?? null,
        }, retryContext)
    }
    await auditarAcaoFiscal({
      tenantId: retryContext.tenantId,
      uid: request.auth.uid,
      entidadeId: rascunhoId ?? erroId ?? input.clienteId,
      acao: resultado.reconciliada ? 'retry_nfse_reconciliado' : 'retry_nfse_sucesso',
      dadosDepois: {
        clienteId: input.clienteId,
        rascunhoId: input.rascunhoId ?? null,
        erroId: erroId ?? null,
        numeroNfse: resultado.numeroNfse ?? null,
      },
    })

    return ok(resultado.mensagem ?? 'Retry emitido com sucesso.', { resultado })
  }
)
