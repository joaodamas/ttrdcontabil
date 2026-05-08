import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { processarEmissao } from './emitir'
import { rotearCancelamento, rotearConsulta } from './municipios/router'
import { decrypt, isEncrypted } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { pfxBase64FromStorageBuffer } from './certificado'
import { assertCanAccessCliente } from '../authz'
import { requireEnvironmentTenant } from '../tenant'
import { redactAuditData, writeAuditLog } from '../audit'
import type { CertificadoA1, ConfigFiscalCliente, EmitirNfseInput, Prestador } from './types'

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

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId)
    .limit(1)
    .get()
  if (snap.empty) throw new HttpsError('not-found', 'Configuração fiscal do cliente não encontrada.')
  const data = snap.docs[0].data()
  return { clienteId, ...data, tenantId: requireEnvironmentTenant(data.tenantId, 'Configuração fiscal') } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente não encontrado.')
  return { id: doc.id, ...doc.data() } as Record<string, unknown>
}

function decryptSenhaCertificado(senhaRaw: string | undefined): string {
  if (!senhaRaw) return ''
  if (!isEncrypted(senhaRaw)) {
    throw new HttpsError(
      'failed-precondition',
      'Senha do certificado em formato legado não criptografado. Reenvie o certificado A1 para salvar a credencial com criptografia.'
    )
  }

  const senha = decrypt(senhaRaw)
  if (!senha) {
    throw new HttpsError(
      'failed-precondition',
      'Não foi possível descriptografar a senha do certificado. Verifique o secret CREDENTIAL_KEY e reenvie o certificado A1.'
    )
  }
  return senha
}

async function getCertificado(config: ConfigFiscalCliente): Promise<CertificadoA1 | undefined> {
  const path = config.credenciais?.certificadoStoragePath
  if (!path) return undefined
  const file = getStorage().bucket().file(path as string)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()
  return {
    pfxBase64: pfxBase64FromStorageBuffer(buffer),
    senha: decryptSenhaCertificado(config.credenciais?.certificadoSenha as string | undefined),
  }
}

async function montarContextoFiscal(nota: Record<string, unknown>, operacao: 'consulta' | 'cancelamento') {
  const clienteId = nota.clienteId as string | undefined
  if (!clienteId) throw new HttpsError('failed-precondition', 'NFS-e sem clienteId.')

  const [config, cliente] = await Promise.all([
    getConfigFiscal(clienteId),
    getCliente(clienteId),
  ])
  if (config.ambienteEmissao === 'producao' && !(await isProducaoLiberadaPorConfigOuConector(config, operacao))) {
    throw new HttpsError('failed-precondition', 'Município/configuração fiscal ainda não liberado para produção.')
  }

  const prestador: Prestador = {
    cnpj: String(cliente.cpfCnpj ?? '').replace(/\D/g, ''),
    inscricaoMunicipal: config.inscricaoMunicipal,
    razaoSocial: cliente.razaoSocial as string,
    municipioIbge: config.municipioIbge,
  }

  return { config, prestador, cert: await getCertificado(config) }
}

function normalizarRascunho(id: string, data: Record<string, unknown>): EmitirNfseInput {
  const dados = (data.dados ?? {}) as Record<string, unknown>
  const tomadorRaw = dados.tomador as Record<string, unknown> | undefined
  const servicoRaw = dados.servico as Record<string, unknown> | undefined

  return {
    clienteId: data.clienteId as string,
    rascunhoId: id,
    competenciaId: (data.competenciaId ?? dados.competenciaId ?? undefined) as string | undefined,
    tomador: tomadorRaw ? {
      razaoSocial: tomadorRaw.razaoSocial as string,
      cpfCnpj: String(tomadorRaw.cpfCnpj ?? '').replace(/\D/g, ''),
      email: tomadorRaw.email as string | undefined,
    } : {
      razaoSocial: dados.tomadorNome as string,
      cpfCnpj: String(dados.tomadorCpfCnpj ?? '').replace(/\D/g, ''),
      email: (dados.tomadorEmail as string | null | undefined) ?? undefined,
    },
    servico: servicoRaw ? {
      discriminacao: servicoRaw.discriminacao as string,
      codigoServico: servicoRaw.codigoServico as string,
      valorServico: Number(servicoRaw.valorServico ?? 0),
      aliquota: servicoRaw.aliquota as number | undefined,
      issRetido: Boolean(servicoRaw.issRetido),
    } : {
      discriminacao: dados.descricaoServico as string,
      codigoServico: dados.codigoServico as string,
      valorServico: Number(dados.valorServico ?? 0),
      aliquota: (dados.aliquota as number | null | undefined) ?? undefined,
      issRetido: Boolean(dados.issRetido),
    },
    numeroRps: (dados.numeroRps as string | undefined) ?? undefined,
    serieRps: (dados.serieRps as string | undefined) ?? undefined,
  }
}

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

  const notaConsulta: Record<string, unknown> = {
    clienteId: input.clienteId,
    tenantId: contexto.tenantId,
    numeroRps: input.numeroRps,
    serieRps: input.serieRps,
  }
  const { config, prestador, cert } = await montarContextoFiscal(notaConsulta, 'consulta')
  const resultadoConsulta = await rotearConsulta({
    nfseId: input.rascunhoId ?? input.numeroRps,
    clienteId: input.clienteId,
    numeroRps: input.numeroRps,
    serieRps: input.serieRps,
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
  { region: 'southamerica-east1', timeoutSeconds: 30, memory: '256MiB', invoker: 'public', secrets: credentialSecrets },
  async (request): Promise<StandardResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { nfseId } = request.data as { nfseId?: string }
    if (!nfseId) throw new HttpsError('invalid-argument', 'nfseId obrigatório.')

    const snap = await db().collection('nfse_emitidas').doc(nfseId).get()
    if (!snap.exists) throw new HttpsError('not-found', 'NFS-e não encontrada.')

    const data = { id: snap.id, ...snap.data() } as Record<string, unknown>
    await assertCanAccessCliente(request.auth.uid, data.clienteId as string | undefined, 'fiscal')
    const { config, prestador, cert } = await montarContextoFiscal(data, 'consulta')
    const resultado = await rotearConsulta({
      nfseId,
      clienteId: data.clienteId as string,
      numeroNfse: data.numeroNfse as string | undefined,
      codigoVerificacao: data.codigoVerificacao as string | undefined,
      numeroRps: data.numeroRps as string | undefined,
      serieRps: data.serieRps as string | undefined,
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
      await db().collection('nfse_emitidas').doc(nfseId).update({
        erroUltimaConsulta: resultado.erro ?? null,
        codigoErroUltimaConsulta: resultado.codigoErro ?? null,
        atualizadoEm: Timestamp.now(),
      })
      return error(resultado.erro ?? 'Consulta fiscal falhou.', resultado.codigoErro, { id: nfseId })
    }

    const updates: Record<string, unknown> = {
      status: resultado.status ?? data.status,
      ultimaConsultaEm: Timestamp.now(),
      erroUltimaConsulta: null,
      codigoErroUltimaConsulta: null,
      atualizadoEm: Timestamp.now(),
    }
    if (resultado.xmlNfse) updates.xmlNfse = resultado.xmlNfse
    if (resultado.pdfUrl) updates.pdfUrl = resultado.pdfUrl
    await db().collection('nfse_emitidas').doc(nfseId).update(updates)

    if (resultado.status === 'processando') {
      return processing(resultado.mensagem ?? 'NFS-e ainda em processamento.', { id: nfseId, ...updates })
    }

    return ok(resultado.mensagem ?? 'Status consultado com sucesso.', { id: nfseId, ...updates })
  }
)

export const cancelarNfse = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', invoker: 'public', secrets: credentialSecrets },
  async (request): Promise<StandardResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { nfseId, motivo } = request.data as { nfseId?: string; motivo?: string }
    if (!nfseId) throw new HttpsError('invalid-argument', 'nfseId obrigatório.')
    if (!motivo || motivo.trim().length < 10) {
      throw new HttpsError('invalid-argument', 'Informe um motivo de cancelamento com pelo menos 10 caracteres.')
    }

    const ref = db().collection('nfse_emitidas').doc(nfseId)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpsError('not-found', 'NFS-e não encontrada.')

    const nota = snap.data() as Record<string, unknown>
    await assertCanAccessCliente(request.auth.uid, nota.clienteId as string | undefined, 'fiscal')
    if (nota.status === 'cancelada') return ok('NFS-e já está cancelada.', { id: nfseId })
    if (nota.status !== 'emitida') {
      throw new HttpsError('failed-precondition', 'Apenas NFS-e emitida pode entrar em cancelamento.')
    }

    const { config, prestador, cert } = await montarContextoFiscal(nota, 'cancelamento')
    const resultado = await rotearCancelamento({
      nfseId,
      clienteId: nota.clienteId as string,
      numeroNfse: nota.numeroNfse as string | undefined,
      codigoVerificacao: nota.codigoVerificacao as string | undefined,
      numeroRps: nota.numeroRps as string | undefined,
      serieRps: nota.serieRps as string | undefined,
      motivo: motivo.trim(),
    }, config, prestador, cert)

    if (!resultado.sucesso) {
      await ref.update({
        erroUltimaTentativa: resultado.erro ?? 'Cancelamento fiscal falhou.',
        codigoErroUltimaTentativa: resultado.codigoErro ?? null,
        tentativasCancelamento: FieldValue.increment(1),
        atualizadoEm: Timestamp.now(),
      })
      await registrarEvento(nfseId, 'cancelamento_erro', request.auth.uid, resultado.erro ?? 'Cancelamento fiscal falhou.', {
        motivo: motivo.trim(),
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
      motivoCancelamento: motivo.trim(),
      cancelamentoSolicitadoEm: Timestamp.now(),
      cancelamentoSolicitadoPorId: request.auth.uid,
      canceladoEm: resultado.status === 'cancelada' ? Timestamp.now() : null,
      tentativasCancelamento: FieldValue.increment(1),
      erroUltimaTentativa: null,
      codigoErroUltimaTentativa: null,
      atualizadoEm: Timestamp.now(),
    })
    await registrarEvento(nfseId, 'cancelamento_solicitado', request.auth.uid, resultado.mensagem ?? 'Cancelamento solicitado.', {
      motivo: motivo.trim(),
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

    return ok(resultado.mensagem ?? 'NFS-e cancelada com sucesso.', { id: nfseId })
  }
)

export const retryNfse = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 120, memory: '512MiB', invoker: 'public', secrets: credentialSecrets },
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
      const raw = (snap.data()?.input as string | undefined) ?? ''
      if (!raw) {
        throw new HttpsError('failed-precondition', 'Retry por erro legado indisponível. Reemita a partir do rascunho NFS-e.')
      }
      input = JSON.parse(raw) as EmitirNfseInput
      await assertCanAccessCliente(request.auth.uid, input.clienteId, 'fiscal')
      retryContext = {
        tenantId: snap.data()?.tenantId as string | undefined,
        clienteId: input.clienteId,
      }
    }

    if (!input) throw new HttpsError('invalid-argument', 'Informe rascunhoId ou erroId.')

    const retryBloqueadoOuEncontrado = await consultarRpsAntesRetry(input, request.auth.uid, retryContext)
    if (retryBloqueadoOuEncontrado) return retryBloqueadoOuEncontrado

    const resultado = await processarEmissao(input, request.auth.uid)
    if (!resultado.sucesso) {
      if (rascunhoId) {
        await registrarEvento(rascunhoId, 'retry_erro', request.auth.uid, resultado.erro ?? 'Retry falhou.', {
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
          rascunhoId: rascunhoId ?? null,
          erroId: erroId ?? null,
          codigoErro: resultado.codigoErro ?? null,
          erro: resultado.erro ?? null,
        },
      })
      return { status: 'error', message: resultado.erro ?? 'Retry falhou.', data: { resultado }, errorCode: resultado.codigoErro }
    }

    if (rascunhoId) {
      await registrarEvento(rascunhoId, 'retry_sucesso', request.auth.uid, 'Retry emitido com sucesso.', {
        numeroNfse: resultado.numeroNfse ?? null,
      }, retryContext)
    }
    await auditarAcaoFiscal({
      tenantId: retryContext.tenantId,
      uid: request.auth.uid,
      entidadeId: rascunhoId ?? erroId ?? input.clienteId,
      acao: 'retry_nfse_sucesso',
      dadosDepois: {
        clienteId: input.clienteId,
        rascunhoId: rascunhoId ?? null,
        erroId: erroId ?? null,
        numeroNfse: resultado.numeroNfse ?? null,
      },
    })

    return ok('Retry emitido com sucesso.', { resultado })
  }
)
