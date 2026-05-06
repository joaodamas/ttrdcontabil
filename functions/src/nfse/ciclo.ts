import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { processarEmissao } from './emitir'
import { rotearCancelamento, rotearConsulta } from './municipios/router'
import { decrypt } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { pfxBase64FromStorageBuffer } from './certificado'
import { assertCanAccessCliente } from '../authz'
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
) {
  await db().collection('nfse_eventos').add({
    nfseId,
    tipo,
    mensagem,
    detalhes: detalhes ?? null,
    actorId: uid,
    criadoEm: Timestamp.now(),
  })
}

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId)
    .limit(1)
    .get()
  if (snap.empty) throw new HttpsError('not-found', 'Configuração fiscal do cliente não encontrada.')
  return { clienteId, ...snap.docs[0].data() } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente não encontrado.')
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
    pfxBase64: pfxBase64FromStorageBuffer(buffer),
    senha: senhaRaw ? (decrypt(senhaRaw) ?? senhaRaw) : '',
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

    if (rascunhoId) {
      const snap = await db().collection('nfse_rascunhos').doc(rascunhoId).get()
      if (!snap.exists) throw new HttpsError('not-found', 'Rascunho não encontrado.')
      await assertCanAccessCliente(request.auth.uid, snap.data()?.clienteId as string | undefined, 'fiscal')
      input = normalizarRascunho(snap.id, snap.data() as Record<string, unknown>)
    } else if (erroId) {
      const snap = await db().collection('nfse_erros').doc(erroId).get()
      if (!snap.exists) throw new HttpsError('not-found', 'Erro de NFS-e não encontrado.')
      const raw = (snap.data()?.input as string | undefined) ?? ''
      if (!raw) {
        throw new HttpsError('failed-precondition', 'Retry por erro legado indisponível. Reemita a partir do rascunho NFS-e.')
      }
      input = JSON.parse(raw) as EmitirNfseInput
      await assertCanAccessCliente(request.auth.uid, input.clienteId, 'fiscal')
    }

    if (!input) throw new HttpsError('invalid-argument', 'Informe rascunhoId ou erroId.')

    const resultado = await processarEmissao(input, request.auth.uid)
    if (!resultado.sucesso) {
      if (rascunhoId) {
        await registrarEvento(rascunhoId, 'retry_erro', request.auth.uid, resultado.erro ?? 'Retry falhou.', {
          codigoErro: resultado.codigoErro ?? null,
        })
      }
      return { status: 'error', message: resultado.erro ?? 'Retry falhou.', data: { resultado }, errorCode: resultado.codigoErro }
    }

    if (rascunhoId) {
      await registrarEvento(rascunhoId, 'retry_sucesso', request.auth.uid, 'Retry emitido com sucesso.', {
        numeroNfse: resultado.numeroNfse ?? null,
      })
    }

    return ok('Retry emitido com sucesso.', { resultado })
  }
)
