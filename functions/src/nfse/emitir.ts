/**
 * Cloud Functions para emissão de NFS-e
 */
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { rotearEmissao } from './municipios/router'
import { encrypt, decrypt, isEncrypted } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { resolverProvedorNfse } from './provedor'
import {
  COLECAO_SEQUENCIAS_DPS, idSequenciaDps, normalizarSerieDps, podeReusarDps, proximoNumeroDps,
} from './nacional/numeracao'
import { assertCaminhoCertificado, pfxBase64FromStorageBuffer } from './certificado'
import { assertCanAccessCliente } from '../authz'
import { validarPayloadFiscal } from './validacao'
import { writeAuditLog, SYSTEM_ACTOR, type AuditActor } from '../audit'
import { requireEnvironmentTenant } from '../tenant'
import { gerarESalvarDanfse } from './danfse/servico'
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
  const pathPersistido = config.credenciais?.certificadoStoragePath
  // Sem certificado é caminho legítimo (município autenticado por token) — segue sem A1. Mas se HÁ caminho, ele não pode ser usado cru:
  // assertCaminhoCertificado confere contra o derivado de clienteId e devolve o
  // derivado. Ver a armadilha documentada em certificado.ts.
  if (!pathPersistido) return undefined
  const path = assertCaminhoCertificado(clienteId, pathPersistido)
  const bucket = getStorage().bucket()
  const file   = bucket.file(path)
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

function resumoTentativaNfse(input: EmitirNfseInput, config: ConfigFiscalCliente) {
  return {
    ...resumoNfseInput(input),
    municipioIbge: config.municipioIbge,
    ambienteEmissao: config.ambienteEmissao,
  }
}

/**
 * Endereço do tomador como mapa sem `undefined` (o Firestore recusa undefined
 * dentro de mapa aninhado). Nada preenchido = null.
 */
function enderecoParaGravar(e: EmitirNfseInput['tomador']['endereco']): Record<string, string> | null {
  if (!e) return null
  const limpo = Object.fromEntries(
    Object.entries(e).filter(([, v]) => typeof v === 'string' && v.trim() !== '').map(([k, v]) => [k, (v as string).trim()]),
  )
  return Object.keys(limpo).length > 0 ? limpo : null
}

/** Campos extras gravados em nfse_emitidas (ex.: marcação de lote). */
export interface OpcoesEmissao {
  extrasNotaEmitida?: Record<string, unknown>
}

/**
 * Contexto da numeração nacional (DPS): só existe quando o provedor efetivo é o
 * Ambiente Nacional. Lido ANTES da transação do rascunho porque a chave do
 * contador depende do CNPJ do prestador, do ambiente e da série.
 */
async function contextoNumeracaoNacional(clienteId: string) {
  // Config ausente: segue o caminho de sempre — enviarEmissao falha com
  // not-found e destrava o rascunho com o erro registrado.
  const config = await getConfigFiscal(clienteId).catch(() => null)
  if (!config || resolverProvedorNfse(config) !== 'nacional') return null
  if (config.ambienteEmissao !== 'producao' && config.ambienteEmissao !== 'homologacao') {
    throw new HttpsError('failed-precondition', 'Ambiente fiscal inválido na configuração do cliente.')
  }
  const cliente = await getCliente(clienteId)
  const cnpj = String(cliente.cpfCnpj ?? '').replace(/\D/g, '')
  const tpAmb: '1' | '2' = config.ambienteEmissao === 'producao' ? '1' : '2'
  let serie: string
  let idSequencia: string
  try {
    serie = normalizarSerieDps(config.serieDps)
    idSequencia = idSequenciaDps(cnpj, tpAmb, serie)
  } catch (err) {
    throw new HttpsError('failed-precondition', err instanceof Error ? err.message : String(err))
  }
  return { cnpj, tpAmb, serie, ref: db().collection(COLECAO_SEQUENCIAS_DPS).doc(idSequencia), tenantId: config.tenantId ?? null }
}

type ContextoNumeracaoNacional = NonNullable<Awaited<ReturnType<typeof contextoNumeracaoNacional>>>

/** Incrementa o contador da DPS dentro da transação recebida (leitura antes de qualquer escrita). */
async function alocarNumeroDps(tx: Transaction, ctx: ContextoNumeracaoNacional): Promise<string> {
  const seq = await tx.get(ctx.ref)
  const numero = proximoNumeroDps(seq.data()?.ultimoNumero)
  tx.set(ctx.ref, {
    cnpj: ctx.cnpj,
    tpAmb: ctx.tpAmb,
    serie: ctx.serie,
    tenantId: ctx.tenantId,
    ultimoNumero: numero,
    atualizadoEm: Timestamp.now(),
  }, { merge: true })
  return String(numero)
}

export async function processarEmissao(input: EmitirNfseInput, uid: string, opcoes: OpcoesEmissao = {}) {
  const actor: AuditActor = { id: uid, nome: 'Usuário autenticado' }

  // ─── RPS/DPS: aloca (ou reusa) e PERSISTE antes de enviar ────────────────────
  // O número/série usados nesta emissão são fixados aqui — não mais deixados para
  // o conector decidir "no meio do caminho". Isso garante que, em caso de timeout
  // pós-envio, o número efetivamente consumido fique registrado localmente
  // (rascunho) e possa ser REUSADO pelo retry, em vez de gerar um novo e
  // arriscar nota duplicada/perdida.
  // Ambiente Nacional: nDPS sequencial por prestador + ambiente + série
  // (dps_sequencias, mesma transação do rascunho). Prefeitura (legado): RPS
  // derivado de Date.now(), como antes.
  const nacional = await contextoNumeracaoNacional(input.clienteId)
  let numeroRps = nacional ? undefined : input.numeroRps
  let serieRps  = nacional ? undefined : input.serieRps

  if (input.rascunhoId) {
    const rascunhoRef = db().collection('nfse_rascunhos').doc(input.rascunhoId)
    const rps = await db().runTransaction(async (tx) => {
      const rascunho = await tx.get(rascunhoRef)
      if (!rascunho.exists) throw new HttpsError('not-found', 'Rascunho não encontrado.')
      const rascunhoData = rascunho.data() ?? {}
      const status = rascunhoData.status as string | undefined
      if (status === 'emitida') throw new HttpsError('already-exists', 'Este rascunho já foi emitido.')
      if (status === 'processando') throw new HttpsError('already-exists', 'Este rascunho já está em processamento.')

      const dadosExistentes = (rascunhoData.dados ?? {}) as Record<string, unknown>
      let numero: string
      let serie: string
      const extras: Record<string, unknown> = {}

      if (nacional) {
        // Reusa só DPS nacional do mesmo ambiente (retry); RPS municipal antigo
        // ou de outro ambiente ganha número novo do contador.
        const existente = {
          numero: dadosExistentes.numeroRps,
          serie: dadosExistentes.serieRps,
          provedor: dadosExistentes.provedorRps,
          tpAmb: dadosExistentes.tpAmbRps,
        }
        if (podeReusarDps(existente, { tpAmb: nacional.tpAmb })) {
          numero = existente.numero as string
          serie = existente.serie as string
        } else {
          serie = nacional.serie
          numero = await alocarNumeroDps(tx, nacional)
        }
        extras['dados.provedorRps'] = 'nacional'
        extras['dados.tpAmbRps'] = nacional.tpAmb
      } else {
        // Reusa o RPS já persistido no rascunho (retry) ou recebido no input;
        // só aloca um novo se nenhum dos dois existir ainda. Trunca para os
        // últimos 8 dígitos do timestamp — mesmo formato que os conectores de
        // São Paulo/Barueri já usam para o campo NumeroRPS (limite do schema
        // municipal); os demais conectores aceitam números mais curtos sem problema.
        numero = numeroRps ?? (dadosExistentes.numeroRps as string | undefined) ?? String(Date.now()).slice(-8)
        serie  = serieRps  ?? (dadosExistentes.serieRps as string | undefined)  ?? 'RPS'
      }

      tx.update(rascunhoRef, {
        status: 'processando',
        tentativas: FieldValue.increment(1),
        erroUltimaTentativa: null,
        atualizadoEm: Timestamp.now(),
        atualizadoPorId: uid,
        'dados.numeroRps': numero,
        'dados.serieRps': serie,
        ...extras,
      })

      return { numero, serie }
    })
    numeroRps = rps.numero
    serieRps  = rps.serie
  } else if (nacional) {
    // Sem rascunho não há onde reusar: sempre um número novo do contador.
    numeroRps = await db().runTransaction((tx) => alocarNumeroDps(tx, nacional))
    serieRps  = nacional.serie
  } else {
    numeroRps = numeroRps ?? String(Date.now()).slice(-8)
    serieRps  = serieRps  ?? 'RPS'
  }

  // Repassa explicitamente ao conector — este apenas reusa o valor recebido
  // (ver municipios/*.ts: `input.numeroRps ?? ...` — fallback só é acionado
  // se, por algum motivo, nada tiver sido alocado acima).
  input = { ...input, numeroRps, serieRps }

  // Competência vinculada → competência da nota (honorário de outubro emitido em
  // novembro sai com competência de outubro). Sem vínculo, o conector usa a data
  // de emissão. Falha de leitura não bloqueia: cai no padrão.
  if (input.competenciaId && !input.dataCompetencia) {
    const comp = await db().collection('competencias').doc(input.competenciaId).get().catch(() => null)
    const mes = Number(comp?.data()?.mes)
    const ano = Number(comp?.data()?.ano)
    if (mes >= 1 && mes <= 12 && ano >= 2000) {
      input = { ...input, dataCompetencia: `${ano}-${String(mes).padStart(2, '0')}-01` }
    }
  }

  try {
    return await enviarEmissao(input, uid, actor, numeroRps, serieRps, opcoes)
  } catch (err) {
    // Falha ANTES de a prefeitura responder (config ausente, payload inválido,
    // certificado, exceção do conector): sem isto o rascunho ficava preso em
    // 'processando' até o alerta diário. O RPS alocado continua gravado no
    // rascunho, então o retry reusa o mesmo número.
    // Só destrava se ainda estiver em 'processando': se a nota chegou a ser
    // gravada (rascunho já 'emitida'), uma falha depois disso não pode fazê-lo
    // voltar para a fila de retry — reemitir com o mesmo RPS duplica a nota.
    if (input.rascunhoId) {
      const msg = err instanceof Error ? err.message : String(err)
      const rascunhoRef = db().collection('nfse_rascunhos').doc(input.rascunhoId)
      await db().runTransaction(async (tx) => {
        const atual = await tx.get(rascunhoRef)
        if (atual.data()?.status !== 'processando') return
        tx.update(rascunhoRef, {
          status: 'erro_integracao',
          erroUltimaTentativa: msg,
          codigoErroUltimaTentativa: err instanceof HttpsError ? err.code : null,
          ultimaTentativaEm: Timestamp.now(),
          atualizadoEm: Timestamp.now(),
          atualizadoPorId: uid,
        })
      }).catch((updateErr) => {
        console.error('[processarEmissao] Falha ao destravar rascunho:', updateErr)
      })
    }
    throw err
  }
}

// Depois que a prefeitura respondeu, a auditoria não pode derrubar a emissão:
// lançar aqui faria a nota emitida parecer falha e reentrar no retry.
async function auditarSemFalhar(params: Parameters<typeof writeAuditLog>[0]) {
  await writeAuditLog(params).catch((err) => {
    console.error('[processarEmissao] Falha ao gravar auditoria:', err)
  })
}

async function enviarEmissao(
  input: EmitirNfseInput,
  uid: string,
  actor: AuditActor,
  numeroRps: string | undefined,
  serieRps: string | undefined,
  opcoes: OpcoesEmissao,
) {
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
    const notaRef = await db().collection('nfse_emitidas').add({
      tenantId:          config.tenantId,
      clienteId:         input.clienteId,
      clienteNome:       cliente.razaoSocial as string,
      competenciaId:     input.competenciaId ?? null,
      rascunhoId:        input.rascunhoId ?? null,
      tomadorNome:       input.tomador.razaoSocial,
      tomadorCpfCnpj:    input.tomador.cpfCnpj,
      // Campos abaixo existem para "Copiar de nota anterior" sem depender do
      // XML (que só o Ambiente Nacional devolve). Ausentes = null, nunca undefined.
      tomadorEmail:      input.tomador.email ?? null,
      tomadorEndereco:   enderecoParaGravar(input.tomador.endereco),
      descricaoServico:  input.servico.discriminacao,
      descricaoServicoModelo: input.servico.descricaoModelo?.trim() || null,
      itemListaServico:  input.servico.itemListaServico ?? null,
      codigoTributacaoNacional: input.servico.codigoTributacaoNacional?.trim() || null,
      codigoNbs:         input.servico.codigoNbs?.trim() || null,
      municipioPrestacaoIbge: input.servico.municipioPrestacao?.trim() || null,
      informacoesComplementares: input.servico.informacoesComplementares?.trim() || null,
      dataCompetencia:   input.dataCompetencia ?? null,
      codigoServico:     input.servico.codigoServico,
      valorServico:      input.servico.valorServico,
      aliquota:          input.servico.aliquota ?? config.aliquotaPadrao ?? null,
      issRetido:         input.servico.issRetido,
      numeroNfse:        resultado.numeroNfse ?? null,
      codigoVerificacao: resultado.codigoVerificacao ?? null,
      chaveAcesso:       resultado.chaveAcesso ?? null,
      idDps:             resultado.idDps ?? null,
      provedorNfse:      resolverProvedorNfse(config),
      numeroRps:         numeroRps ?? null,
      serieRps:          serieRps ?? null,
      xmlNfse:           resultado.xmlNfse ?? null,
      pdfUrl:            resultado.pdfUrl ?? null,
      municipioIbge:     config.municipioIbge,
      municipioNome:     config.municipioEmissor,
      status:            'emitida',
      tentativas:        1,
      dataEmissao:       now,
      criadoEm:          now,
      criadoPorId:       uid,
      // Distingue emissão pelo cron de recorrência automática (uid === SYSTEM_ACTOR.id)
      // de emissão disparada por um humano (clique em Emitir NFS-e) — usado no
      // histórico/logs pra mostrar a origem de cada nota.
      origemEmissao:     uid === SYSTEM_ACTOR.id ? 'automatica' : 'manual',
      ambienteEmissao:   config.ambienteEmissao,
      valorDeducoes:     input.servico.valorDeducoes ?? 0,
      ...(opcoes.extrasNotaEmitida ?? {}),
    })

    if (input.rascunhoId) {
      await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
        status:       'emitida',
        erroUltimaTentativa: null,
        codigoErroUltimaTentativa: null,
        detalhesUltimaTentativa: null,
        requestResumoUltimaTentativa: null,
        ultimaTentativaEm: now,
        atualizadoEm: now,
        atualizadoPorId: uid,
      })
    }
    await auditarSemFalhar({
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

    // DANFSe da plataforma (a API do ADN foi sobrestada pela NT 008/2026).
    // Best-effort: falhar aqui não pode fazer a nota emitida parecer falha —
    // o usuário ainda gera o PDF depois pelo botão (callable gerarDanfse).
    if (resultado.xmlNfse && !resultado.pdfUrl) {
      await gerarESalvarDanfse(notaRef.id).catch((err) => {
        console.warn('[processarEmissao] DANFSe não gerado após a emissão:', err instanceof Error ? err.message : err)
      })
    }
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
      origemEmissao: uid === SYSTEM_ACTOR.id ? 'automatica' : 'manual',
    })
    if (input.rascunhoId) {
      await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
        status: 'erro_integracao',
        erroId: erroRef.id,
        erroUltimaTentativa: erro,
        codigoErroUltimaTentativa: resultado.codigoErro ?? null,
        detalhesUltimaTentativa: resultado.detalhes ?? null,
        requestResumoUltimaTentativa: resumoTentativaNfse(input, config),
        ultimaTentativaEm: now,
        atualizadoEm: now,
        atualizadoPorId: uid,
        // Reforça a persistência do RPS já alocado (defesa em profundidade —
        // a transação acima já grava isto, mas garante o dado para o retry
        // mesmo que este bloco venha a ser alcançado por outro caminho).
        'dados.numeroRps': numeroRps ?? null,
        'dados.serieRps': serieRps ?? null,
      })
    }
    await auditarSemFalhar({
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
