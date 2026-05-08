/**
 * Cloud Functions para emissão de NFS-e
 */
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { rotearEmissao } from './municipios/router'
import { encrypt, decrypt, isEncrypted } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { pfxBase64FromStorageBuffer } from './certificado'
import { assertCanAccessCliente } from '../authz'
import { validarPayloadFiscal } from './validacao'
import { writeAuditLog, type AuditActor } from '../audit'
import { requireEnvironmentTenant } from '../tenant'
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
  const data = snap.docs[0].data()
  return { clienteId, ...data, tenantId: requireEnvironmentTenant(data.tenantId, 'Configuração fiscal') } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente não encontrado.')
  return { id: doc.id, ...doc.data() } as Record<string, unknown>
}

async function getActor(uid: string): Promise<AuditActor> {
  const snap = await db().collection('usuarios').doc(uid).get()
  const data = snap.exists ? snap.data() : null
  return {
    id: uid,
    nome: (data?.nome as string | undefined) ?? uid,
    email: (data?.email as string | undefined) ?? null,
  }
}

async function registrarEventoFiscal(params: {
  tenantId: string
  clienteId: string
  titulo: string
  descricao: string
  origemColecao: string
  origemId: string
  actor: AuditActor
  metadata?: Record<string, unknown>
}) {
  await db().collection('events').add({
    tenantId: params.tenantId,
    clienteId: params.clienteId,
    tipo: 'fiscal',
    titulo: params.titulo,
    descricao: params.descricao,
    origemColecao: params.origemColecao,
    origemId: params.origemId,
    actorId: params.actor.id,
    actorNome: params.actor.nome,
    metadata: {
      severidade: 'media',
      href: `/clientes/${params.clienteId}/fiscal`,
      actorId: params.actor.id,
      actorNome: params.actor.nome,
      ...(params.metadata ?? {}),
    },
    criadoEm: Timestamp.now(),
  })
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

async function getCertificado(clienteId: string, config: ConfigFiscalCliente): Promise<CertificadoA1 | undefined> {
  const path = config.credenciais?.certificadoStoragePath
  if (!path) return undefined
  const bucket = getStorage().bucket()
  const file   = bucket.file(path as string)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()

  const senhaDecrypt = decryptSenhaCertificado(config.credenciais?.certificadoSenha as string | undefined)

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
  const actor: AuditActor = { id: uid, nome: 'Usuário autenticado' }
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
  const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')
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
    await writeAuditLog({
      tenantId,
      actor,
      entidade: 'nfse_emitidas',
      entidadeId: resultado.numeroNfse ?? input.rascunhoId ?? null,
      acao: 'emissao_nfse_sucesso',
      dadosDepois: {
        ...resumoNfseInput(input),
        numeroNfse: resultado.numeroNfse ?? null,
        codigoVerificacao: resultado.codigoVerificacao ?? null,
        municipioIbge: config.municipioIbge,
        ambienteEmissao: config.ambienteEmissao,
      },
      origem: 'cloud_function',
    })
  } else {
    const erro = resultado.erro ?? 'Erro não informado pelo conector.'
    const erroRef = await db().collection('nfse_erros').add({
      tenantId:    config.tenantId,
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
    await writeAuditLog({
      tenantId,
      actor,
      entidade: 'nfse_erros',
      entidadeId: erroRef.id,
      acao: 'emissao_nfse_erro',
      dadosDepois: {
        ...resumoNfseInput(input),
        erro,
        codigoErro: resultado.codigoErro ?? null,
        municipioIbge: config.municipioIbge,
        ambienteEmissao: config.ambienteEmissao,
      },
      origem: 'cloud_function',
    })
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
      const fiscalDoc = snap.docs[0]
      const fiscalData = fiscalDoc.data()
      const tenantId = requireEnvironmentTenant(fiscalData.tenantId, 'Configuração fiscal')
      const actor = await getActor(request.auth.uid)

      await fiscalDoc.ref.update({
        'credenciais.certificadoStoragePath': path,
        'credenciais.certificadoSenha':       senhaCriptografada, // criptografada
        'credenciais.certTitular':            info.titular,
        'credenciais.certVencimento':         info.vencimento.toISOString(),
        'credenciais.certValido':             info.valido,
        atualizadoEm: Timestamp.now(),
        atualizadoPorId: actor.id,
        atualizadoPorNome: actor.nome,
      })

      await writeAuditLog({
        tenantId,
        actor,
        entidade: 'clientes_fiscal',
        entidadeId: fiscalDoc.id,
        acao: 'upload_certificado_a1',
        dadosAntes: null,
        dadosDepois: {
          clienteId,
          certificadoStoragePath: path,
          certTitular: info.titular,
          certVencimento: info.vencimento.toISOString(),
          certValido: info.valido,
        },
        origem: 'cloud_function',
      })

      await registrarEventoFiscal({
        tenantId,
        clienteId,
        titulo: 'Certificado A1 atualizado',
        descricao: `Certificado fiscal salvo e validado para ${info.titular}.`,
        origemColecao: 'clientes_fiscal',
        origemId: fiscalDoc.id,
        actor,
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
    const actor = await getActor(request.auth.uid)

    if (docId) {
      // Atualiza doc existente — merge no sub-objeto credenciais
      const fiscalDoc = await db().collection('clientes_fiscal').doc(docId).get()
      if (!fiscalDoc.exists) throw new HttpsError('not-found', 'Configuração fiscal não encontrada.')
      const tenantId = requireEnvironmentTenant(fiscalDoc.data()?.tenantId, 'Configuração fiscal')
      const updates: Record<string, unknown> = { atualizadoEm: now, atualizadoPorId: actor.id, atualizadoPorNome: actor.nome }
      for (const [key, value] of Object.entries(credenciaisCriptografadas)) {
        updates[`credenciais.${key}`] = value
      }
      await fiscalDoc.ref.update(updates)

      await writeAuditLog({
        tenantId,
        actor,
        entidade: 'clientes_fiscal',
        entidadeId: docId,
        acao: 'update_credenciais_fiscais',
        dadosAntes: null,
        dadosDepois: {
          clienteId,
          camposAtualizados: Object.keys(credenciaisCriptografadas),
        },
        origem: 'cloud_function',
      })

      await registrarEventoFiscal({
        tenantId,
        clienteId,
        titulo: 'Credenciais fiscais atualizadas',
        descricao: 'Credenciais de integração fiscal foram atualizadas.',
        origemColecao: 'clientes_fiscal',
        origemId: docId,
        actor,
      })
    } else {
      // Busca pelo clienteId se docId não fornecido
      const snap = await db().collection('clientes_fiscal')
        .where('clienteId', '==', clienteId)
        .limit(1)
        .get()

      if (snap.empty) {
        throw new HttpsError('not-found', 'Configuração fiscal não encontrada para este cliente.')
      }

      const fiscalDoc = snap.docs[0]
      const tenantId = requireEnvironmentTenant(fiscalDoc.data().tenantId, 'Configuração fiscal')
      const updates: Record<string, unknown> = { atualizadoEm: now, atualizadoPorId: actor.id, atualizadoPorNome: actor.nome }
      for (const [key, value] of Object.entries(credenciaisCriptografadas)) {
        updates[`credenciais.${key}`] = value
      }
      await fiscalDoc.ref.update(updates)

      await writeAuditLog({
        tenantId,
        actor,
        entidade: 'clientes_fiscal',
        entidadeId: fiscalDoc.id,
        acao: 'update_credenciais_fiscais',
        dadosAntes: null,
        dadosDepois: {
          clienteId,
          camposAtualizados: Object.keys(credenciaisCriptografadas),
        },
        origem: 'cloud_function',
      })

      await registrarEventoFiscal({
        tenantId,
        clienteId,
        titulo: 'Credenciais fiscais atualizadas',
        descricao: 'Credenciais de integração fiscal foram atualizadas.',
        origemColecao: 'clientes_fiscal',
        origemId: fiscalDoc.id,
        actor,
      })
    }

    return { sucesso: true }
  }
)
