/**
 * Cloud Functions para emissão de NFS-e
 *
 * Idempotência da emissão pelo Ambiente Nacional (achados C1/A2 de 2026-11-06):
 *  1. TODA emissão nacional tem um rascunho persistido ANTES do envio — o do
 *     usuário, ou um criado aqui com id derivado da chave de idempotência que o
 *     formulário gera uma vez por nota (`emissao_<chave>`);
 *  2. o nDPS é alocado UMA vez e gravado no rascunho; reenvio reusa o mesmo;
 *  3. o rascunho é travado em transação ('processando' + travaId + validade
 *     curta): dois envios simultâneos do mesmo rascunho → o segundo é recusado;
 *  4. nDPS reaproveitado → consulta GET /dps/{id} ANTES de reenviar; nota
 *     existe → só registra (nfse_emitidas + rascunho emitido), sem reenviar;
 *  5. E0014 (DPS já usada) → mesma consulta e registro.
 */
import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'
import { rotearEmissao } from './municipios/router'
import { encrypt } from './encrypt'
import { credentialSecrets } from './secrets'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import { resolverProvedorNfse } from './provedor'
import {
  COLECAO_SEQUENCIAS_DPS, idSequenciaDps, normalizarSerieDps, podeReusarDps, proximoNumeroDps,
} from './nacional/numeracao'
import { CODIGO_DPS_JA_EMITIDA } from './nacional/codigos'
import { assertCanAccessCliente, assertPerfil } from '../authz'
import { validarPayloadFiscal } from './validacao'
import { writeAuditLog, SYSTEM_ACTOR, type AuditActor } from '../audit'
import { requireEnvironmentTenant } from '../tenant'
import { gerarESalvarDanfse } from './danfse/servico'
import { getCertificado, getCliente, getConfigFiscal, montarPrestador } from './contexto'
import { dadosRascunhoDoInput, normalizarRascunho } from './normalizar-rascunho'
import {
  avaliarTrava, chaveIdempotenciaValida, filtrarCredenciais, idRascunhoEmissaoDireta,
} from './regras-emissao'
import {
  COLECAO_RASCUNHOS, consultarDpsNaSefin, gravarNotaEmitida, liberarRascunhoComErro, novaTrava,
  resultadoDeNotaExistente,
} from './reconciliacao'
import type { EmitirNfseInput, ConfigFiscalCliente, ResultadoEmissao } from './types'

const db = () => admin.firestore()

async function validarCert(pfxBase64: string, senha: string) {
  const { validarCertificado } = await import('./xml/signer')
  return validarCertificado(pfxBase64, senha)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    numeroRps: input.numeroRps ?? null,
    serieRps: input.serieRps ?? null,
  }
}

function resumoTentativaNfse(input: EmitirNfseInput, config: ConfigFiscalCliente) {
  return {
    ...resumoNfseInput(input),
    municipioIbge: config.municipioIbge,
    ambienteEmissao: config.ambienteEmissao,
  }
}

/** Opções de processarEmissao. */
export interface OpcoesEmissao {
  /** Campos extras gravados em nfse_emitidas (ex.: marcação de lote). */
  extrasNotaEmitida?: Record<string, unknown>
  /**
   * Chave que o formulário gera UMA vez por nota (emissão sem rascunho salvo).
   * O servidor cria/reusa o rascunho `emissao_<chave>`: o segundo clique cai
   * no mesmo rascunho e no mesmo nDPS.
   */
  chaveIdempotencia?: string
  /**
   * O input veio do navegador (formulário): grava os dados no rascunho antes
   * de enviar e emite a partir do que foi gravado (normalizador único). Lote,
   * cron, retry e reconciliação já leem do rascunho — não regravam.
   */
  persistirDados?: boolean
}

/**
 * Contexto da numeração nacional (DPS): só existe quando o provedor efetivo é o
 * Ambiente Nacional. Lido ANTES da transação do rascunho porque a chave do
 * contador depende do CNPJ do prestador, do ambiente e da série.
 */
function contextoNumeracaoNacional(config: ConfigFiscalCliente, cliente: Record<string, unknown>) {
  if (resolverProvedorNfse(config) !== 'nacional') return null
  if (config.ambienteEmissao !== 'producao' && config.ambienteEmissao !== 'homologacao') {
    throw new HttpsError('failed-precondition', 'Ambiente fiscal inválido na configuração do cliente.')
  }
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

type ContextoNumeracaoNacional = NonNullable<ReturnType<typeof contextoNumeracaoNacional>>

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

/** Competência vinculada → data de competência da nota (honorário de outubro emitido em novembro). */
async function comDataCompetencia(input: EmitirNfseInput): Promise<EmitirNfseInput> {
  if (!input.competenciaId || input.dataCompetencia) return input
  const comp = await db().collection('competencias').doc(input.competenciaId).get().catch(() => null)
  const mes = Number(comp?.data()?.mes)
  const ano = Number(comp?.data()?.ano)
  if (mes >= 1 && mes <= 12 && ano >= 2000) {
    return { ...input, dataCompetencia: `${ano}-${String(mes).padStart(2, '0')}-01` }
  }
  return input
}

interface Travado {
  numero: string
  serie: string
  /** O número já estava gravado antes desta tentativa (pode ter sido enviado). */
  reusado: boolean
  travaId: string
}

/**
 * Trava o rascunho e fixa o nDPS em UMA transação. Confere vínculo do rascunho
 * com o cliente e o tenant (M3): o rascunho de outro cliente não serve de
 * carona para emitir em nome deste.
 */
async function travarRascunho(params: {
  rascunhoId: string
  input: EmitirNfseInput
  config: ConfigFiscalCliente
  cliente: Record<string, unknown>
  nacional: ContextoNumeracaoNacional | null
  uid: string
  criarSeAusente: boolean
  dadosParaGravar: Record<string, unknown> | null
}): Promise<Travado | { emitida: true }> {
  const { rascunhoId, input, config, cliente, nacional, uid } = params
  const ref = db().collection(COLECAO_RASCUNHOS).doc(rascunhoId)
  const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const agora = Date.now()
    const trava = novaTrava(agora)
    const d = (snap.data() ?? {}) as Record<string, unknown>

    if (snap.exists) {
      if (d.clienteId !== input.clienteId) {
        throw new HttpsError('permission-denied', 'Rascunho não pertence a este cliente.')
      }
      if (d.tenantId !== tenantId) {
        throw new HttpsError('permission-denied', 'Rascunho pertence a outro tenant.')
      }
      const decisao = avaliarTrava({
        status: d.status,
        travaExpiraEmMs: (d.travaExpiraEm as Timestamp | null | undefined)?.toMillis?.() ?? null,
        atualizadoEmMs: (d.atualizadoEm as Timestamp | null | undefined)?.toMillis?.() ?? null,
      }, agora)
      if (!decisao.pode && decisao.motivo === 'emitida') return { emitida: true as const }
      if (!decisao.pode) {
        throw new HttpsError('already-exists', 'Esta nota já está sendo enviada à Sefin. Aguarde o resultado — não envie de novo.')
      }
    } else if (!params.criarSeAusente) {
      throw new HttpsError('not-found', 'Rascunho não encontrado.')
    }

    const dadosExistentes = (d.dados ?? {}) as Record<string, unknown>
    let numero: string
    let serie: string
    let reusado = false
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
        reusado = true
      } else {
        serie = nacional.serie
        numero = await alocarNumeroDps(tx, nacional)
      }
      extras.provedorRps = 'nacional'
      extras.tpAmbRps = nacional.tpAmb
    } else {
      // Prefeitura (legado): reusa o RPS persistido ou recebido; senão um novo
      // (últimos 8 dígitos do timestamp — limite do schema municipal).
      numero = input.numeroRps ?? (dadosExistentes.numeroRps as string | undefined) ?? String(Date.now()).slice(-8)
      serie  = input.serieRps  ?? (dadosExistentes.serieRps as string | undefined)  ?? 'RPS'
      reusado = Boolean(dadosExistentes.numeroRps)
    }

    const comumTrava = {
      status: 'processando',
      ...trava,
      processandoDesde: Timestamp.fromMillis(agora),
      tentativas: FieldValue.increment(1),
      tentativasReconciliacao: 0,
      erroUltimaTentativa: null,
      atualizadoEm: Timestamp.now(),
      atualizadoPorId: uid,
    }

    if (!snap.exists) {
      tx.set(ref, {
        tenantId,
        clienteId: input.clienteId,
        clienteNome: (cliente.razaoSocial as string | undefined) ?? null,
        competenciaId: input.competenciaId ?? null,
        titulo: `NFS-e — ${input.tomador?.razaoSocial ?? ''}`.trim(),
        // Criado pelo servidor para a emissão direta do formulário: guarda o nDPS
        // reservado e permite consultar/reconciliar se a resposta não chegar.
        origem: 'emissao_direta',
        requerRevisao: false,
        criadoEm: Timestamp.now(),
        criadoPor: uid,
        ...comumTrava,
        tentativas: 1,
        dados: { ...(params.dadosParaGravar ?? {}), numeroRps: numero, serieRps: serie, ...extras },
      })
    } else {
      const update: Record<string, unknown> = { ...comumTrava, 'dados.numeroRps': numero, 'dados.serieRps': serie }
      for (const [k, v] of Object.entries(extras)) update[`dados.${k}`] = v
      if (params.dadosParaGravar) {
        for (const [k, v] of Object.entries(params.dadosParaGravar)) update[`dados.${k}`] = v
        update.competenciaId = input.competenciaId ?? null
      }
      tx.update(ref, update)
    }

    return { numero, serie, reusado, travaId: trava.travaId }
  })
}

/** Nota já registrada para o rascunho (crash entre gravar a nota e marcar o rascunho, ou rascunho já emitido). */
async function notaRegistradaDoRascunho(rascunhoId: string, tenantId: string | undefined, clienteId: string) {
  const snap = await db().collection('nfse_emitidas').where('rascunhoId', '==', rascunhoId).limit(5).get()
  return snap.docs.find((d) => d.data().tenantId === tenantId && d.data().clienteId === clienteId) ?? null
}

export async function processarEmissao(inputRecebido: EmitirNfseInput, uid: string, opcoes: OpcoesEmissao = {}): Promise<ResultadoEmissao> {
  const actor: AuditActor = { id: uid, nome: uid === SYSTEM_ACTOR.id ? SYSTEM_ACTOR.nome : 'Usuário autenticado' }

  // ─── Contexto e validação ANTES de tocar no rascunho/numeração ─────────────
  // Dado inválido não pode criar rascunho nem queimar nDPS.
  const [config, cliente] = await Promise.all([
    getConfigFiscal(inputRecebido.clienteId),
    getCliente(inputRecebido.clienteId),
  ])
  const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')
  const nacional = contextoNumeracaoNacional(config, cliente)

  if (!config.municipioIbge) throw new HttpsError('failed-precondition', 'Código IBGE do município não configurado.')
  // Inscrição municipal só é exigida pelo webservice da prefeitura (M6).
  if (!nacional && !config.inscricaoMunicipal) throw new HttpsError('failed-precondition', 'Inscrição municipal não configurada.')
  if (config.ambienteEmissao === 'producao' && !(await isProducaoLiberadaPorConfigOuConector(config, 'emissao'))) {
    throw new HttpsError('failed-precondition', 'Município/configuração fiscal ainda não liberado para emissão em produção.')
  }

  let input = await comDataCompetencia(inputRecebido)
  const prestador = montarPrestador(config, cliente)
  const errosValidacao = validarPayloadFiscal(input, config, prestador)
  if (errosValidacao.length > 0) {
    throw new HttpsError('invalid-argument', `Payload fiscal inválido: ${errosValidacao.join(' ')}`)
  }

  // ─── Rascunho que guarda o nDPS ──────────────────────────────────────────
  let rascunhoId = input.rascunhoId
  let criarSeAusente = false
  if (!rascunhoId && nacional) {
    const chave = chaveIdempotenciaValida(opcoes.chaveIdempotencia) ? opcoes.chaveIdempotencia : randomUUID()
    rascunhoId = idRascunhoEmissaoDireta(chave)
    criarSeAusente = true
  }

  if (!rascunhoId) {
    // Prefeitura (legado) sem rascunho: como antes, RPS do timestamp.
    input = { ...input, numeroRps: input.numeroRps ?? String(Date.now()).slice(-8), serieRps: input.serieRps ?? 'RPS' }
    return enviarEmissao({ input, uid, actor, config, cliente, opcoes, travaId: undefined })
  }

  const persistir = criarSeAusente || opcoes.persistirDados === true
  const dadosParaGravar = persistir ? dadosRascunhoDoInput(input) : null

  const travado = await travarRascunho({
    rascunhoId, input, config, cliente, nacional, uid, criarSeAusente, dadosParaGravar,
  })

  if ('emitida' in travado) {
    const nota = await notaRegistradaDoRascunho(rascunhoId, tenantId, input.clienteId)
    if (!nota) throw new HttpsError('already-exists', 'Este rascunho já foi emitido.')
    return resultadoDeNotaExistente(nota.data(), {
      nfseId: nota.id,
      rascunhoId,
      mensagem: `Esta nota já foi emitida (NFS-e nº ${nota.data().numeroNfse ?? '—'}) — nada foi reenviado.`,
    })
  }

  // Emite a partir do MESMO normalizador que lote/cron/retry usam: o input do
  // formulário passou por dadosRascunhoDoInput e volta por normalizarRascunho.
  input = dadosParaGravar
    ? normalizarRascunho(rascunhoId, { clienteId: input.clienteId, competenciaId: input.competenciaId ?? null, dados: dadosParaGravar })
    : input
  input = { ...input, rascunhoId, numeroRps: travado.numero, serieRps: travado.serie }

  try {
    if (nacional && travado.reusado) {
      // nDPS reaproveitado = pode ter sido enviado antes (timeout, function que
      // morreu, E0014). Primeiro o registro interno, depois a Sefin.
      const interna = await notaRegistradaDoRascunho(rascunhoId, tenantId, input.clienteId)
      if (interna) {
        await gravarNotaEmitida({ input, config, cliente, uid }, interna.data(), 'reconciliacao')
        return resultadoDeNotaExistente(interna.data(), {
          nfseId: interna.id, rascunhoId, mensagem: 'A nota já estava registrada — nada foi reenviado.',
        })
      }
      const cert = await getCertificado(config)
      const desfecho = await consultarDpsNaSefin(input, config, prestador, cert)
      if (desfecho.tipo === 'existe') {
        return await registrarReconciliada({ input, config, cliente, uid, actor, opcoes }, desfecho.resultado, 'consulta_previa')
      }
      if (desfecho.tipo === 'indefinido') {
        // Sem saber se a DPS gerou nota, reenviar é apostar numa duplicata:
        // não envia. A rotina de 15 min (ou a próxima tentativa) consulta de novo.
        const erro = `Não foi possível confirmar na Sefin se a DPS nº ${input.numeroRps} já gerou nota (${desfecho.erro}). Nada foi reenviado — tente de novo em alguns minutos.`
        await liberarRascunhoComErro(rascunhoId, travado.travaId, {
          erroUltimaTentativa: erro,
          codigoErroUltimaTentativa: 'NAO_CONFIRMADA',
          detalhesUltimaTentativa: desfecho.detalhes ?? null,
          atualizadoPorId: uid,
        })
        return { sucesso: false, erro, codigoErro: 'NAO_CONFIRMADA', detalhes: desfecho.detalhes, rascunhoId }
      }
      // 'nao_existe': consulta conclusiva — segue para o envio com o mesmo número.
    }
    return await enviarEmissao({ input, uid, actor, config, cliente, opcoes, travaId: travado.travaId })
  } catch (err) {
    // Falha antes de a Sefin/prefeitura responder (certificado, exceção do
    // conector): destrava com o erro. O nDPS continua gravado no rascunho,
    // então a próxima tentativa reusa o mesmo número (e consulta antes).
    const msg = err instanceof Error ? err.message : String(err)
    await liberarRascunhoComErro(rascunhoId, travado.travaId, {
      erroUltimaTentativa: msg,
      codigoErroUltimaTentativa: err instanceof HttpsError ? err.code : null,
      atualizadoPorId: uid,
    }).catch((updateErr) => {
      console.error('[processarEmissao] Falha ao destravar rascunho:', updateErr)
    })
    throw err
  }
}

// Depois que a Sefin/prefeitura respondeu, a auditoria não pode derrubar a
// emissão: lançar aqui faria a nota emitida parecer falha e reentrar no retry.
async function auditarSemFalhar(params: Parameters<typeof writeAuditLog>[0]) {
  await writeAuditLog(params).catch((err) => {
    console.error('[processarEmissao] Falha ao gravar auditoria:', err)
  })
}

interface ContextoEnvio {
  input: EmitirNfseInput
  uid: string
  actor: AuditActor
  config: ConfigFiscalCliente
  cliente: Record<string, unknown>
  opcoes: OpcoesEmissao
  travaId: string | undefined
}

async function aposGravarNota(ctx: ContextoEnvio, nfseId: string, resultado: { numeroNfse?: string; codigoVerificacao?: string; xmlNfse?: string; pdfUrl?: string }, acao: string) {
  const { input, config, actor } = ctx
  await auditarSemFalhar({
    tenantId: config.tenantId!,
    actor,
    entidade: 'nfse_emitidas',
    entidadeId: nfseId,
    acao,
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
  // Best-effort: falhar aqui não pode fazer a nota emitida parecer falha.
  if (resultado.xmlNfse && !resultado.pdfUrl) {
    await gerarESalvarDanfse(nfseId).catch((err) => {
      console.warn('[processarEmissao] DANFSe não gerado após a emissão:', err instanceof Error ? err.message : err)
    })
  }
}

/** Nota ENCONTRADA na Sefin (consulta prévia ou E0014): registra sem reenviar. */
async function registrarReconciliada(
  ctx: Omit<ContextoEnvio, 'travaId'>,
  achada: { numeroNfse?: string; codigoVerificacao?: string; chaveAcesso?: string; xmlNfse?: string; pdfUrl?: string; status?: string },
  motivo: 'consulta_previa' | 'dps_duplicada',
): Promise<ResultadoEmissao> {
  const { nfseId } = await gravarNotaEmitida(
    { input: ctx.input, config: ctx.config, cliente: ctx.cliente, uid: ctx.uid, extrasNotaEmitida: ctx.opcoes.extrasNotaEmitida },
    { ...achada, status: achada.status === 'cancelada' ? 'cancelada' : 'emitida' },
    'reconciliacao',
  )
  await aposGravarNota({ ...ctx, travaId: undefined }, nfseId, achada, 'emissao_nfse_reconciliada')
  const mensagem = motivo === 'dps_duplicada'
    ? `A Sefin informou que esta DPS já tinha gerado a NFS-e nº ${achada.numeroNfse ?? '—'} — registrada na plataforma, nada foi reenviado.`
    : `A tentativa anterior já tinha gerado a NFS-e nº ${achada.numeroNfse ?? '—'} na Sefin — registrada na plataforma, nada foi reenviado.`
  return {
    sucesso: true,
    numeroNfse: achada.numeroNfse,
    codigoVerificacao: achada.codigoVerificacao ?? achada.chaveAcesso,
    chaveAcesso: achada.chaveAcesso,
    xmlNfse: achada.xmlNfse,
    nfseId,
    rascunhoId: ctx.input.rascunhoId,
    jaEmitida: true,
    reconciliada: true,
    mensagem,
  }
}

async function enviarEmissao(ctx: ContextoEnvio): Promise<ResultadoEmissao> {
  const { input, uid, actor, config, cliente, travaId } = ctx
  const tenantId = config.tenantId!
  const prestador = montarPrestador(config, cliente)
  const cert = await getCertificado(config)

  const resultado = await rotearEmissao(input, config, prestador, cert)

  if (resultado.sucesso) {
    const { nfseId } = await gravarNotaEmitida(
      { input, config, cliente, uid, extrasNotaEmitida: ctx.opcoes.extrasNotaEmitida },
      resultado,
      'envio',
    )
    await aposGravarNota(ctx, nfseId, resultado, 'emissao_nfse_sucesso')
    return { ...resultado, nfseId, rascunhoId: input.rascunhoId }
  }

  // DPS já usada (E0014): a nota existe — consulta e registra em vez de recusar.
  if (resultado.codigoErro === CODIGO_DPS_JA_EMITIDA && resolverProvedorNfse(config) === 'nacional') {
    const desfecho = await consultarDpsNaSefin(input, config, prestador, cert)
    if (desfecho.tipo === 'existe') {
      return registrarReconciliada(ctx, desfecho.resultado, 'dps_duplicada')
    }
    // Não achou: segue como erro (o rascunho fica a confirmar pela rotina).
    resultado.codigoErro = 'NAO_CONFIRMADA'
    resultado.erro = `${resultado.erro ?? ''} A consulta da DPS não confirmou a nota (${desfecho.tipo === 'indefinido' ? desfecho.erro : 'não encontrada'}) — a plataforma tenta confirmar de novo em até 15 minutos.`.trim()
  }

  const now = Timestamp.now()
  const erro = resultado.erro ?? 'Erro não informado pelo conector.'
  const erroRef = await db().collection('nfse_erros').add({
    tenantId,
    clienteId:   input.clienteId,
    clienteNome: cliente.razaoSocial as string,
    rascunhoId:  input.rascunhoId ?? null,
    erro,
    codigoErro:  resultado.codigoErro ?? null,
    detalhes:    resultado.detalhes ?? null,
    inputResumo: resumoNfseInput(input),
    criadoEm:    now,
    criadoPorId: uid,
    origemEmissao: uid === SYSTEM_ACTOR.id ? 'automatica' : 'manual',
  })
  if (input.rascunhoId) {
    await liberarRascunhoComErro(input.rascunhoId, travaId, {
      erroId: erroRef.id,
      erroUltimaTentativa: erro,
      codigoErroUltimaTentativa: resultado.codigoErro ?? null,
      detalhesUltimaTentativa: resultado.detalhes ?? null,
      requestResumoUltimaTentativa: resumoTentativaNfse(input, config),
      atualizadoPorId: uid,
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

  return { ...resultado, rascunhoId: input.rascunhoId }
}

// ─── Function: emitirNfse ─────────────────────────────────────────────────────

export const emitirNfse = onCall(
  // 300 s: pior caso de uma emissão nacional ≈ 140 s (ver PRAZOS_NACIONAL_MS).
  // Com 60 s a function morria antes da resposta da Sefin, com a nota já gerada.
  { region: 'southamerica-east1', timeoutSeconds: 300, memory: '512MiB', invoker: 'public', secrets: credentialSecrets },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')

    const { chaveIdempotencia, ...input } = (request.data ?? {}) as EmitirNfseInput & { chaveIdempotencia?: string }
    if (!input.clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')
    if (!input.tomador)   throw new HttpsError('invalid-argument', 'Dados do tomador obrigatórios.')
    if (!input.servico)   throw new HttpsError('invalid-argument', 'Dados do serviço obrigatórios.')
    // O SDK do navegador serializa `undefined` como null: os dois = "sem chave".
    if (chaveIdempotencia != null && !chaveIdempotenciaValida(chaveIdempotencia)) {
      throw new HttpsError('invalid-argument', 'Chave de idempotência inválida.')
    }

    await assertCanAccessCliente(request.auth.uid, input.clienteId, 'fiscal')

    // O número da DPS NUNCA vem do navegador: é o servidor quem aloca/reusa.
    const { numeroRps: _n, serieRps: _s, ...semNumero } = input
    void _n; void _s

    try {
      return await processarEmissao(semNumero as EmitirNfseInput, request.auth.uid, {
        chaveIdempotencia: chaveIdempotencia ?? undefined,
        persistirDados: true,
      })
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

    // Sem configuração fiscal o certificado iria para o Storage sem nenhum
    // registro apontando para ele (nem a senha): o arquivo ficava órfão e o
    // usuário via "sucesso". Confere ANTES de gravar qualquer coisa (M4).
    const snap = await db().collection('clientes_fiscal')
      .where('clienteId', '==', clienteId)
      .limit(1)
      .get()
    if (snap.empty) {
      throw new HttpsError('failed-precondition', 'Salve a configuração fiscal do cliente antes de enviar o certificado A1.')
    }
    const fiscalDoc = snap.docs[0]
    const tenantId = requireEnvironmentTenant(fiscalDoc.data().tenantId, 'Configuração fiscal')

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
    // Só quem pode enviar o certificado (uploadCertificado → 'fiscal'). Antes
    // bastava estar logado: qualquer conta testava senhas de .pfx à vontade.
    await assertPerfil(request.auth.uid, ['admin', 'fiscal'], 'Apenas administradores e fiscais validam certificados.')

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
    const acesso = await assertCanAccessCliente(request.auth.uid, clienteId, 'fiscal')

    // Allowlist (M5): certificado (caminho/senha/titular) só muda por
    // uploadCertificado; chave desconhecida é recusada, não ignorada em silêncio.
    const { aceitas, recusadas } = filtrarCredenciais(credenciais)
    if (recusadas.length > 0) {
      throw new HttpsError('invalid-argument', `Campos de credencial não permitidos: ${recusadas.join(', ')}.`)
    }
    if (Object.keys(aceitas).length === 0) {
      throw new HttpsError('invalid-argument', 'Nenhuma credencial preenchida.')
    }

    const credenciaisCriptografadas: Record<string, string> = {}
    for (const [key, value] of Object.entries(aceitas)) credenciaisCriptografadas[key] = encrypt(value)

    // Documento alvo: o informado precisa ser DO cliente informado e do tenant
    // de quem chama — antes o docId de qualquer cliente era aceito.
    let fiscalDoc: FirebaseFirestore.DocumentSnapshot
    if (docId) {
      fiscalDoc = await db().collection('clientes_fiscal').doc(docId).get()
      if (!fiscalDoc.exists) throw new HttpsError('not-found', 'Configuração fiscal não encontrada.')
      if (fiscalDoc.data()?.clienteId !== clienteId) {
        throw new HttpsError('permission-denied', 'Configuração fiscal não pertence a este cliente.')
      }
    } else {
      const snap = await db().collection('clientes_fiscal')
        .where('clienteId', '==', clienteId)
        .limit(1)
        .get()
      if (snap.empty) throw new HttpsError('not-found', 'Configuração fiscal não encontrada para este cliente.')
      fiscalDoc = snap.docs[0]
    }
    const tenantId = requireEnvironmentTenant(fiscalDoc.data()?.tenantId, 'Configuração fiscal')
    if (tenantId !== acesso.usuario.tenantId) {
      throw new HttpsError('permission-denied', 'Configuração fiscal pertence a outro tenant.')
    }

    const now = Timestamp.now()
    const actor = await getActor(request.auth.uid)
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

    return { sucesso: true }
  }
)
