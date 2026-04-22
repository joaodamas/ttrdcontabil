/**
 * Cloud Functions para emissão de NFS-e
 */
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { rotearEmissao } from './municipios/router'
import { validarCertificado as validarCert } from './xml/signer'
import type {
  EmitirNfseInput, ConfigFiscalCliente,
  Prestador, CertificadoA1,
} from './types'

const db = () => admin.firestore()

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
  const file   = bucket.file(path)
  const [exists] = await file.exists()
  if (!exists) return undefined
  const [buffer] = await file.download()
  return {
    pfxBase64: buffer.toString('base64'),
    senha:     config.credenciais?.certificadoSenha ?? '',
  }
}

// ─── Function: emitirNfse ─────────────────────────────────────────────────────

export const emitirNfse = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '512MiB', invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const input = request.data as EmitirNfseInput
    if (!input.clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')
    if (!input.tomador)   throw new HttpsError('invalid-argument', 'Dados do tomador obrigatórios.')
    if (!input.servico)   throw new HttpsError('invalid-argument', 'Dados do serviço obrigatórios.')

    // Busca configurações
    const [config, cliente] = await Promise.all([
      getConfigFiscal(input.clienteId),
      getCliente(input.clienteId),
    ])

    if (!config.municipioIbge) throw new HttpsError('failed-precondition', 'Código IBGE do município não configurado.')
    if (!config.inscricaoMunicipal) throw new HttpsError('failed-precondition', 'Inscrição municipal não configurada.')

    const prestador: Prestador = {
      cnpj:              (cliente.cpfCnpj as string).replace(/\D/g, ''),
      inscricaoMunicipal: config.inscricaoMunicipal,
      razaoSocial:        cliente.razaoSocial as string,
      municipioIbge:      config.municipioIbge,
    }

    // Busca certificado (se necessário)
    const cert = await getCertificado(input.clienteId, config)

    // Emite via roteador de municípios
    const resultado = await rotearEmissao(input, config, prestador, cert)

    // Persiste resultado no Firestore
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
        municipioIbge:     config.municipioIbge,
        municipioNome:     config.municipioEmissor,
        status:            'emitida',
        dataEmissao:       now,
        criadoEm:          now,
        criadoPorId:       request.auth.uid,
        ambienteEmissao:   config.ambienteEmissao,
      })

      // Remove rascunho se existia
      if (input.rascunhoId) {
        await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
          status:      'emitida',
          atualizadoEm: now,
        })
      }
    } else {
      // Registra tentativa com falha
      await db().collection('nfse_erros').add({
        clienteId:   input.clienteId,
        clienteNome: cliente.razaoSocial as string,
        erro:        resultado.erro,
        detalhes:    resultado.detalhes ?? null,
        input:       JSON.stringify(input),
        criadoEm:    now,
        criadoPorId: request.auth.uid,
      })
    }

    return resultado
  }
)

// ─── Function: uploadCertificado ──────────────────────────────────────────────

export const uploadCertificado = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, invoker: 'public' },
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

    // Valida certificado antes de salvar
    let info: { valido: boolean; vencimento: Date; titular: string }
    try {
      info = validarCert(pfxBase64, senha)
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
    await file.save(Buffer.from(pfxBase64), {
      contentType: 'application/octet-stream',
      metadata:    { titularCertificado: info.titular },
    })

    // Atualiza config fiscal com referência + senha
    const snap = await db().collection('clientes_fiscal')
      .where('clienteId', '==', clienteId)
      .limit(1)
      .get()

    if (!snap.empty) {
      await snap.docs[0].ref.update({
        'credenciais.certificadoStoragePath': path,
        'credenciais.certificadoSenha':       senha,
        'credenciais.certTitular':            info.titular,
        'credenciais.certVencimento':         info.vencimento.toISOString(),
        'credenciais.certValido':             info.valido,
        atualizadoEm: Timestamp.now(),
      })
    }

    return {
      sucesso:    true,
      titular:    info.titular,
      vencimento: info.vencimento.toISOString(),
      valido:     info.valido,
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
      const info = validarCert(pfxBase64, senha)
      return { valido: info.valido, titular: info.titular, vencimento: info.vencimento.toISOString() }
    } catch {
      throw new HttpsError('invalid-argument', 'Certificado inválido ou senha incorreta.')
    }
  }
)
