/**
 * Cloud Functions para emissão de NFS-e
 */
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { rotearEmissao } from './municipios/router'
import { encrypt, decrypt } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { pfxBase64FromStorageBuffer } from './certificado'
import { assertCanAccessCliente } from '../authz'
import { validarPayloadFiscal } from './validacao'
import type {
  EmitirNfseInput, ConfigFiscalCliente,
  Prestador, CertificadoA1,
} from './types'

const db = () => admin.firestore()

async function validarCert(pfxBase64: string, senha: string) {
  const { validarCertificado } = await import('./xml/signer')
  return validarCertificado(pfxBase64, senha)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId)
    .limit(1)
    .get()
  if (snap.empty) throw new HttpsError('not-found', 'Configuração fiscal do cliente não encontrada. Configure em Clientes → Fiscal.')
  return { clienteId, ...snap.docs[0].data() } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente não encontrado.')
  return { id: doc.id, ...doc.data() } as Record<string, unknown>
}

async function getCertificado(clienteId: string, config: ConfigFiscalCliente): Promise<CertificadoA1 | undefined> {
  const path = config.credenciais?.certificadoStoragePath
  if (!path) return undefined
  const bucket = getStorage().bucket()
  const file   = bucket.file(path as string)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()

  // Descriptografa a senha do certificado
  const senhaRaw     = config.credenciais?.certificadoSenha as string | undefined
  const senhaDecrypt = senhaRaw ? (decrypt(senhaRaw) ?? senhaRaw) : ''

  return {
    pfxBase64: pfxBase64FromStorageBuffer(buffer),
    senha:     senhaDecrypt,
  }
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

export async function processarEmissao(input: EmitirNfseInput, uid: string) {
  if (input.rascunhoId) {
    const rascunhoRef = db().collection('nfse_rascunhos').doc(input.rascunhoId)
    await db().runTransaction(async (tx) => {
      const rascunho = await tx.get(rascunhoRef)
      if (!rascunho.exists) throw new HttpsError('not-found', 'Rascunho não encontrado.')
      const status = rascunho.data()?.status as string | undefined
      if (status === 'emitida') throw new HttpsError('already-exists', 'Este rascunho já foi emitido.')
      if (status === 'processando') throw new HttpsError('already-exists', 'Este rascunho já está em processamento.')
      tx.update(rascunhoRef, {
        status: 'processando',
        tentativas: FieldValue.increment(1),
        erroUltimaTentativa: null,
        atualizadoEm: Timestamp.now(),
        atualizadoPorId: uid,
      })
    })
  }

  const [config, cliente] = await Promise.all([
    getConfigFiscal(input.clienteId),
    getCliente(input.clienteId),
  ])

  if (!config.municipioIbge)       throw new HttpsError('failed-precondition', 'Código IBGE do município não configurado.')
  if (!config.inscricaoMunicipal)  throw new HttpsError('failed-precondition', 'Inscrição municipal não configurada.')
  if (config.ambienteEmissao === 'producao' && !(await isProducaoLiberadaPorConfigOuConector(config, 'emissao'))) {
    throw new HttpsError('failed-precondition', 'Município/configuração fiscal ainda não liberado para emissão em produção.')
  }

  const prestador: Prestador = {
    cnpj:               (cliente.cpfCnpj as string).replace(/\D/g, ''),
    inscricaoMunicipal:  config.inscricaoMunicipal,
    razaoSocial:         cliente.razaoSocial as string,
    municipioIbge:       config.municipioIbge,
  }

  const errosValidacao = validarPayloadFiscal(input, config, prestador)
  if (errosValidacao.length > 0) {
    throw new HttpsError('invalid-argument', `Payload fiscal inválido: ${errosValidacao.join(' ')}`)
  }

  const cert = await getCertificado(input.clienteId, config)

  const resultado = await rotearEmissao(input, config, prestador, cert)

  const now = Timestamp.now()
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
      pdfUrl:            resultado.pdfUrl ?? null,
      municipioIbge:     config.municipioIbge,
      municipioNome:     config.municipioEmissor,
      status:            'emitida',
      tentativas:        1,
      dataEmissao:       now,
      criadoEm:          now,
      criadoPorId:       uid,
      ambienteEmissao:   config.ambienteEmissao,
      valorDeducoes:     input.servico.valorDeducoes ?? 0,
    })

    if (input.rascunhoId) {
      await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
        status:       'emitida',
        erroUltimaTentativa: null,
        atualizadoEm: now,
        atualizadoPorId: uid,
      })
    }
  } else {
    const erro = resultado.erro ?? 'Erro não informado pelo conector.'
    await db().collection('nfse_erros').add({
      clienteId:   input.clienteId,
      clienteNome: cliente.razaoSocial as string,
      erro,
      codigoErro:  resultado.codigoErro ?? null,
      detalhes:    resultado.detalhes ?? null,
      inputResumo: resumoNfseInput(input),
      criadoEm:    now,
      criadoPorId: uid,
    })
    if (input.rascunhoId) {
      await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
        status: 'erro_integracao',
        erroUltimaTentativa: erro,
        codigoErroUltimaTentativa: resultado.codigoErro ?? null,
        atualizadoEm: now,
        atualizadoPorId: uid,
      })
    }
  }

  return resultado
}

// ─── Function: emitirNfse ─────────────────────────────────────────────────────

export const emitirNfse = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '512MiB', invoker: 'public', secrets: credentialSecrets },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const input = request.data as EmitirNfseInput
    console.log('[emitirNfse] clienteId recebido:', input.clienteId)
    if (!input.clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')
    if (!input.tomador)   throw new HttpsError('invalid-argument', 'Dados do tomador obrigatórios.')
    if (!input.servico)   throw new HttpsError('invalid-argument', 'Dados do serviço obrigatórios.')

    try {
      await assertCanAccessCliente(request.auth.uid, input.clienteId, 'fiscal')
    } catch (err) {
      console.error('[emitirNfse] assertCanAccessCliente falhou:', err)
      throw err
    }

    try {
      return await processarEmissao(input, request.auth.uid)
    } catch (err) {
      console.error('[emitirNfse] processarEmissao falhou:', err)
      throw err
    }
  }
)

// ─── Function: uploadCertificado ──────────────────────────────────────────────

export const uploadCertificado = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, invoker: 'public', secrets: credentialSecrets },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { clienteId, pfxBase64, senha } = request.data as {
      clienteId: string
      pfxBase64: string
      senha:     string
    }

    if (!clienteId || !pfxBase64 || !senha) {
      throw new HttpsError('invalid-argument', 'clienteId, pfxBase64 e senha são obrigatórios.')
    }
    await assertCanAccessCliente(request.auth.uid, clienteId, 'fiscal')

    let info: { valido: boolean; vencimento: Date; titular: string }
    try {
      info = await validarCert(pfxBase64, senha)
    } catch {
      throw new HttpsError('invalid-argument', 'Certificado inválido ou senha incorreta.')
    }

    if (!info.valido) {
      throw new HttpsError('invalid-argument', `Certificado vencido em ${info.vencimento.toLocaleDateString('pt-BR')}.`)
    }

    // Salva no Storage
    const path   = `certificados/${clienteId}.pfx.b64`
    const bucket = getStorage().bucket()
    const file   = bucket.file(path)
    await file.save(Buffer.from(pfxBase64, 'base64'), {
      contentType: 'application/octet-stream',
      metadata:    { titularCertificado: info.titular },
    })

    // Criptografa a senha antes de salvar no Firestore
    const senhaCriptografada = encrypt(senha)

    const snap = await db().collection('clientes_fiscal')
      .where('clienteId', '==', clienteId)
      .limit(1)
      .get()

    if (!snap.empty) {
      await snap.docs[0].ref.update({
        'credenciais.certificadoStoragePath': path,
        'credenciais.certificadoSenha':       senhaCriptografada, // criptografada
        'credenciais.certTitular':            info.titular,
        'credenciais.certVencimento':         info.vencimento.toISOString(),
        'credenciais.certValido':             info.valido,
        atualizadoEm: Timestamp.now(),
      })
    }

    return {
      sucesso:     true,
      titular:     info.titular,
      vencimento:  info.vencimento.toISOString(),
      valido:      info.valido,
      storagePath: path,
    }
  }
)

// ─── Function: validarCertificado ─────────────────────────────────────────────

export const validarCertificado = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 15, invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { pfxBase64, senha } = request.data as { pfxBase64: string; senha: string }
    if (!pfxBase64 || !senha) throw new HttpsError('invalid-argument', 'pfxBase64 e senha são obrigatórios.')

    try {
      const info = await validarCert(pfxBase64, senha)
      return { valido: info.valido, titular: info.titular, vencimento: info.vencimento.toISOString() }
    } catch {
      throw new HttpsError('invalid-argument', 'Certificado inválido ou senha incorreta.')
    }
  }
)

// ─── Function: salvarCredenciaisFiscais ───────────────────────────────────────
// Recebe tokens/senhas de portais (Simpliss, CONAM, GIAP) e os criptografa
// antes de salvar no Firestore. O frontend NUNCA salva credenciais diretamente.

export const salvarCredenciaisFiscais = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 15, invoker: 'public', secrets: credentialSecrets },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { clienteId, docId, credenciais } = request.data as {
      clienteId:   string
      docId?:      string
      credenciais: Record<string, string>
    }

    if (!clienteId || !credenciais) {
      throw new HttpsError('invalid-argument', 'clienteId e credenciais são obrigatórios.')
    }
    await assertCanAccessCliente(request.auth.uid, clienteId, 'fiscal')

    // Criptografa cada campo de credencial fornecido
    const credenciaisCriptografadas: Record<string, string> = {}
    for (const [key, value] of Object.entries(credenciais)) {
      if (value && typeof value === 'string') {
        credenciaisCriptografadas[key] = encrypt(value)
      }
    }

    const now = Timestamp.now()

    if (docId) {
      // Atualiza doc existente — merge no sub-objeto credenciais
      const updates: Record<string, unknown> = { atualizadoEm: now }
      for (const [key, value] of Object.entries(credenciaisCriptografadas)) {
        updates[`credenciais.${key}`] = value
      }
      await db().collection('clientes_fiscal').doc(docId).update(updates)
    } else {
      // Busca pelo clienteId se docId não fornecido
      const snap = await db().collection('clientes_fiscal')
        .where('clienteId', '==', clienteId)
        .limit(1)
        .get()

      if (snap.empty) {
        throw new HttpsError('not-found', 'Configuração fiscal não encontrada para este cliente.')
      }

      const updates: Record<string, unknown> = { atualizadoEm: now }
      for (const [key, value] of Object.entries(credenciaisCriptografadas)) {
        updates[`credenciais.${key}`] = value
      }
      await snap.docs[0].ref.update(updates)
    }

    return { sucesso: true }
  }
)
