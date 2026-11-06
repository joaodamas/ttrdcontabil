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
 *  5. E0014 (DPS já usada):
 *     - nDPS REAPROVEITADO (esta nota já pode ter ido antes) → mesma consulta
 *       e registro da nota encontrada;
 *     - nDPS RECÉM-ALOCADO nesta tentativa (nunca saiu por esta nota) → a
 *       nota que existe é de FORA (cliente emitiu pelo Emissor Nacional
 *       web/app na mesma série, ou contador restaurado de backup): NÃO é
 *       registrada como desta nota; o contador avança para além do número
 *       colidido e a nota é reenviada com o número seguinte (até
 *       MAX_SALTOS_COLISAO vezes).
 *     Em ambos os casos o contador passa do número colidido.
 *
 * Emissão SÓ pelo Ambiente Nacional (decisão do dono, 2026-11-06): os
 * conectores municipais e a Spedy saíram do código.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp, type Transaction, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'
import { rotearEmissao } from './roteador'
import { encrypt } from './encrypt'
import { credentialSecrets } from './secrets'
import { exigirSegundoFatorSeObrigatorio } from '../seguranca/mfa'
import { isProducaoLiberadaPorConfigOuConector } from './conectores'
import {
  COLECAO_SEQUENCIAS_DPS, idSequenciaDps, normalizarSerieDps, pisoNumeracaoDps, podeReusarDps, proximoNumeroDps,
  ultimoAposColisao, validarProximoNumeroDps,
} from './nacional/numeracao'
import { CODIGO_DPS_JA_EMITIDA } from './nacional/codigos'
import { assertCanAccessCliente, assertPerfil } from '../authz'
import { preValidarPayload } from './validacao'
import { bloqueiosDe, textoBloqueios, type AchadoFiscal } from './pre-validacao'
import {
  atorDaRequisicao, requisicaoDoCallable, textoSeguroParaLog, writeAuditLog, SYSTEM_ACTOR,
  type AuditActor, type AuditRequisicao,
} from '../audit'
import { requireEnvironmentTenant } from '../tenant'
import { logErro } from '../log'
import { gerarESalvarDanfse } from './danfse/servico'
import { registrarFalhaEmissao } from './log-emissao'
import { getCertificado, getCliente, getConfigFiscal, localizarDocConfigFiscal, montarPrestador } from './contexto'
import { conteudoCertificadoParaStorage, resolverCaminhoCertificado } from './certificado'
import { dadosRascunhoDoInput, normalizarRascunho } from './normalizar-rascunho'
import { avaliarTrava, chaveIdempotenciaValida, idRascunhoEmissaoDireta } from './regras-emissao'
import {
  COLECAO_RASCUNHOS, consultarDpsNaSefin, gravarNotaEmitida, liberarRascunhoComErro, novaTrava,
  resultadoDeNotaExistente,
} from './reconciliacao'
import type { EmitirNfseInput, ConfigFiscalCliente, ResultadoEmissao } from './types'

const db = () => getFirestore()

async function validarCert(pfxBase64: string, senha: string) {
  const { validarCertificado } = await import('./xml/signer')
  return validarCertificado(pfxBase64, senha)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  /**
   * Quem pediu, para o log de auditoria: callables passam o ator do TOKEN
   * (atorDaRequisicao — não `usuarios.nome`, que o usuário edita) e o IP/
   * navegador da chamada. Cron/rotina usam SYSTEM_ACTOR.
   */
  actor?: AuditActor
  requisicao?: AuditRequisicao | null
}

/** Quantas vezes a emissão pula para o número seguinte após E0014 com nDPS novo. */
export const MAX_SALTOS_COLISAO = 5

/**
 * Contexto da numeração nacional (DPS). Lido ANTES da transação do rascunho
 * porque a chave do contador depende do CNPJ do prestador, do ambiente e da série.
 */
function contextoNumeracaoNacional(config: ConfigFiscalCliente, cliente: Record<string, unknown>) {
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
  return {
    cnpj, tpAmb, serie,
    ref: db().collection(COLECAO_SEQUENCIAS_DPS).doc(idSequencia),
    tenantId: config.tenantId ?? null,
    // "Próximo número" informado na config (cliente que já emitiu pelo
    // Emissor Nacional web/app nesta série): o contador nunca fica abaixo.
    piso: pisoNumeracaoDps(config, serie, tpAmb),
  }
}

type ContextoNumeracaoNacional = ReturnType<typeof contextoNumeracaoNacional>

/** Incrementa o contador da DPS dentro da transação recebida (leitura antes de qualquer escrita). */
async function alocarNumeroDps(tx: Transaction, ctx: ContextoNumeracaoNacional): Promise<string> {
  const seq = await tx.get(ctx.ref)
  const numero = proximoNumeroDps(seq.data()?.ultimoNumero, ctx.piso)
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
  nacional: ContextoNumeracaoNacional
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

    // Reusa só DPS nacional do mesmo ambiente (retry); RPS do antigo conector
    // municipal ou DPS de outro ambiente ganha número novo do contador.
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
      // Passou na pré-validação: some a marca de bloqueio de uma tentativa anterior.
      const update: Record<string, unknown> = { ...comumTrava, preValidacao: null, 'dados.numeroRps': numero, 'dados.serieRps': serie }
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

/**
 * Grava no rascunho existente o resultado da pré-validação (só o campo
 * `preValidacao`): a lista/lote mostra o motivo sem o rascunho mudar de status,
 * de trava ou de erro da última tentativa — esses campos guiam a reconciliação
 * de notas que podem já ter saído, e uma pré-validação não pode apagá-los.
 */
async function marcarBloqueioNoRascunho(rascunhoId: string, clienteId: string, tenantId: string, bloqueios: AchadoFiscal[], uid: string) {
  try {
    const ref = db().collection(COLECAO_RASCUNHOS).doc(rascunhoId)
    const snap = await ref.get()
    const d = snap.data()
    if (!snap.exists || d?.clienteId !== clienteId || d?.tenantId !== tenantId) return
    if (d?.status === 'emitida' || d?.status === 'processando') return
    await ref.update({
      preValidacao: {
        bloqueado: true,
        bloqueios: bloqueios.map(({ regra, campo, codigoSefin, mensagem }) => ({ regra, campo, codigoSefin: codigoSefin ?? null, mensagem })),
        verificadoEm: Timestamp.now(),
        verificadoPorId: uid,
      },
    })
  } catch (err) {
    console.warn('[processarEmissao] Não foi possível marcar a pré-validação no rascunho:', err instanceof Error ? err.message : err)
  }
}

/** Nota já registrada para o rascunho (crash entre gravar a nota e marcar o rascunho, ou rascunho já emitido). */
async function notaRegistradaDoRascunho(rascunhoId: string, tenantId: string | undefined, clienteId: string) {
  const snap = await db().collection('nfse_emitidas').where('rascunhoId', '==', rascunhoId).limit(5).get()
  return snap.docs.find((d) => d.data().tenantId === tenantId && d.data().clienteId === clienteId) ?? null
}

export async function processarEmissao(inputRecebido: EmitirNfseInput, uid: string, opcoes: OpcoesEmissao = {}): Promise<ResultadoEmissao> {
  const actor: AuditActor = opcoes.actor
    ?? (uid === SYSTEM_ACTOR.id ? SYSTEM_ACTOR : { id: uid, nome: 'Usuário autenticado' })

  // ─── Contexto e validação ANTES de tocar no rascunho/numeração ─────────────
  // Dado inválido não pode criar rascunho nem queimar nDPS.
  const [config, cliente] = await Promise.all([
    getConfigFiscal(inputRecebido.clienteId),
    getCliente(inputRecebido.clienteId),
  ])
  const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')
  const nacional = contextoNumeracaoNacional(config, cliente)

  if (!config.municipioIbge) throw new HttpsError('failed-precondition', 'Código IBGE do município não configurado.')
  if (config.ambienteEmissao === 'producao' && !(await isProducaoLiberadaPorConfigOuConector(config, 'emissao'))) {
    throw new HttpsError('failed-precondition', 'Ambiente Nacional ainda não liberado para emissão em produção (Administração → Ambiente Nacional).')
  }

  let input = await comDataCompetencia(inputRecebido)
  if (!input.clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')
  const prestador = montarPrestador(config, cliente)

  // ─── Pré-validação fiscal (motor único, o mesmo da tela) ─────────────────
  // Valida o que de fato vai para a DPS: o input do formulário passa pelo
  // normalizador (ida e volta) antes de ser emitido — então é ele que se valida.
  // Bloqueio = nada de rascunho novo, trava, nDPS ou chamada à Sefin.
  const vaiPersistir = opcoes.persistirDados === true || !input.rascunhoId
  const paraValidar = vaiPersistir
    ? normalizarRascunho(input.rascunhoId ?? 'pre-validacao', {
        clienteId: input.clienteId, competenciaId: input.competenciaId ?? null, dados: dadosRascunhoDoInput(input),
      })
    : input
  const bloqueios = bloqueiosDe(preValidarPayload(paraValidar, config, prestador))
  if (bloqueios.length > 0) {
    if (input.rascunhoId) await marcarBloqueioNoRascunho(input.rascunhoId, input.clienteId, tenantId, bloqueios, uid)
    throw new HttpsError('failed-precondition', `A nota não pode ser emitida: ${textoBloqueios(bloqueios)}`, {
      codigo: 'PRE_VALIDACAO',
      bloqueios: bloqueios.map(({ regra, campo, codigoSefin, mensagem }) => ({ regra, campo, codigoSefin: codigoSefin ?? null, mensagem })),
    })
  }

  // ─── Rascunho que guarda o nDPS ──────────────────────────────────────────
  let rascunhoId = input.rascunhoId
  let criarSeAusente = false
  if (!rascunhoId) {
    const chave = chaveIdempotenciaValida(opcoes.chaveIdempotencia) ? opcoes.chaveIdempotencia : randomUUID()
    rascunhoId = idRascunhoEmissaoDireta(chave)
    criarSeAusente = true
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
    if (travado.reusado) {
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
      if (desfecho.tipo === 'outra_nota') {
        // O número reservado foi usado FORA desta nota (Emissor Nacional
        // web/app, contador restaurado): não registra a nota de outra pessoa —
        // pula para um número livre e envia como número novo.
        const proximo = await renumerarAposColisao(rascunhoId, travado.travaId, nacional, input.numeroRps!)
        if (!proximo) throw new HttpsError('aborted', 'A nota mudou durante o envio. Atualize a tela e tente de novo.')
        return await enviarEmissao({
          input: { ...input, numeroRps: proximo }, uid, actor, config, cliente, opcoes, travaId: travado.travaId, nacional, numeroNovo: true,
        })
      }
      // 'nao_existe': consulta conclusiva — segue para o envio com o mesmo número.
    }
    return await enviarEmissao({
      input, uid, actor, config, cliente, opcoes, travaId: travado.travaId, nacional, numeroNovo: !travado.reusado,
    })
  } catch (err) {
    // Falha antes de a Sefin responder (certificado, exceção do
    // conector): destrava com o erro. O nDPS continua gravado no rascunho,
    // então a próxima tentativa reusa o mesmo número (e consulta antes).
    const msg = err instanceof Error ? err.message : String(err)
    await liberarRascunhoComErro(rascunhoId, travado.travaId, {
      erroUltimaTentativa: msg,
      codigoErroUltimaTentativa: err instanceof HttpsError ? err.code : null,
      atualizadoPorId: uid,
    }).catch((updateErr) => {
      logErro('[processarEmissao][falha-destravar-rascunho]', { erro: textoSeguroParaLog(updateErr) })
    })
    throw err
  }
}

// Depois que a Sefin respondeu, a auditoria não pode derrubar a
// emissão: lançar aqui faria a nota emitida parecer falha e reentrar no retry.
async function auditarSemFalhar(params: Parameters<typeof writeAuditLog>[0]) {
  await writeAuditLog(params).catch((err) => {
    logErro('[processarEmissao][falha-auditoria]', { erro: textoSeguroParaLog(err) })
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
  nacional: ContextoNumeracaoNacional
  /** O nDPS foi alocado NESTA tentativa (nunca saiu por esta nota antes). */
  numeroNovo: boolean
}

type ContextoNota = Pick<ContextoEnvio, 'input' | 'uid' | 'actor' | 'config' | 'cliente' | 'opcoes'>

async function aposGravarNota(ctx: ContextoNota, nfseId: string, resultado: { numeroNfse?: string; codigoVerificacao?: string; xmlNfse?: string; pdfUrl?: string }, acao: string) {
  const { input, config, actor } = ctx
  await auditarSemFalhar({
    tenantId: config.tenantId!,
    actor,
    requisicao: ctx.opcoes.requisicao ?? null,
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
      console.warn('[processarEmissao] DANFSe não gerado após a emissão:', textoSeguroParaLog(err))
    })
  }
}

/** Nota ENCONTRADA na Sefin (consulta prévia ou E0014): registra sem reenviar. */
async function registrarReconciliada(
  ctx: ContextoNota,
  achada: { numeroNfse?: string; codigoVerificacao?: string; chaveAcesso?: string; xmlNfse?: string; pdfUrl?: string; status?: string },
  motivo: 'consulta_previa' | 'dps_duplicada',
): Promise<ResultadoEmissao> {
  const { nfseId } = await gravarNotaEmitida(
    { input: ctx.input, config: ctx.config, cliente: ctx.cliente, uid: ctx.uid, extrasNotaEmitida: ctx.opcoes.extrasNotaEmitida },
    { ...achada, status: achada.status === 'cancelada' ? 'cancelada' : 'emitida' },
    'reconciliacao',
  )
  await aposGravarNota(ctx, nfseId, achada, 'emissao_nfse_reconciliada')
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

/**
 * Colisão E0014 com nDPS recém-alocado: o número já foi usado FORA desta nota.
 * Em transação (só se a trava ainda for desta tentativa e o rascunho ainda
 * tiver o número colidido): o contador passa a pelo menos o número colidido,
 * aloca o seguinte (respeitando o piso da config) e grava no rascunho.
 * null = a trava/rascunho mudou — não renumera.
 */
async function renumerarAposColisao(
  rascunhoId: string,
  travaId: string | undefined,
  nacional: ContextoNumeracaoNacional,
  colidido: string,
): Promise<string | null> {
  const ref = db().collection(COLECAO_RASCUNHOS).doc(rascunhoId)
  return db().runTransaction(async (tx) => {
    const [snap, seq] = [await tx.get(ref), await tx.get(nacional.ref)]
    const d = snap.data()
    const dados = (d?.dados ?? {}) as Record<string, unknown>
    if (!d || d.status !== 'processando' || (travaId && d.travaId !== travaId) || dados.numeroRps !== colidido) return null
    const numero = proximoNumeroDps(ultimoAposColisao(seq.data()?.ultimoNumero, colidido), nacional.piso)
    tx.set(nacional.ref, {
      cnpj: nacional.cnpj,
      tpAmb: nacional.tpAmb,
      serie: nacional.serie,
      tenantId: nacional.tenantId,
      ultimoNumero: numero,
      ultimaColisaoNumero: Number(colidido),
      ultimaColisaoEm: Timestamp.now(),
      atualizadoEm: Timestamp.now(),
    }, { merge: true })
    tx.update(ref, {
      'dados.numeroRps': String(numero),
      numeroDpsColididoUltimo: colidido,
      atualizadoEm: Timestamp.now(),
    })
    return String(numero)
  })
}

/**
 * E0014 em nDPS reaproveitado: além de reconciliar, garante que o contador
 * passou do número colidido (a próxima emissão não pode repeti-lo).
 * Best-effort — não derruba a reconciliação.
 */
async function avancarContadorAlemDe(nacional: ContextoNumeracaoNacional, colidido: string) {
  await db().runTransaction(async (tx) => {
    const seq = await tx.get(nacional.ref)
    const atual = seq.data()?.ultimoNumero
    const ultimo = ultimoAposColisao(atual, colidido)
    if (ultimo === atual) return
    tx.set(nacional.ref, {
      cnpj: nacional.cnpj, tpAmb: nacional.tpAmb, serie: nacional.serie, tenantId: nacional.tenantId,
      ultimoNumero: ultimo, ultimaColisaoNumero: Number(colidido), ultimaColisaoEm: Timestamp.now(), atualizadoEm: Timestamp.now(),
    }, { merge: true })
  }).catch((err) => {
    console.warn('[processarEmissao] Não foi possível avançar o contador da DPS após E0014:', textoSeguroParaLog(err))
  })
}

/** Orçamento para pular números após E0014 (a function tem 300 s; cada envio pode levar até 90 s). */
const ORCAMENTO_SALTOS_MS = 120_000

async function enviarEmissao(ctx: ContextoEnvio): Promise<ResultadoEmissao> {
  const { uid, actor, config, cliente, travaId, nacional } = ctx
  let input = ctx.input
  const tenantId = config.tenantId!
  const prestador = montarPrestador(config, cliente)
  const cert = await getCertificado(config)
  const inicio = Date.now()

  let resultado = await rotearEmissao(input, config, prestador, cert)

  // E0014 (série + número da DPS já usados):
  //  - nDPS REAPROVEITADO: pode ser a nota desta mesma nota numa tentativa
  //    anterior → consulta; se a nota encontrada é desta, registra.
  //  - nDPS RECÉM-ALOCADO (ou a consulta achou nota de OUTRO tomador/valor):
  //    o número foi usado fora desta nota (Emissor Nacional web/app na mesma
  //    série, ou contador restaurado de backup). Registrar a nota existente
  //    atribuiria a este rascunho a nota de outra pessoa — então o contador
  //    passa do número colidido e a nota vai com o número seguinte.
  let novo = ctx.numeroNovo
  let saltos = 0
  let limparNumero = false
  while (!resultado.sucesso && resultado.codigoErro === CODIGO_DPS_JA_EMITIDA && input.rascunhoId) {
    if (!novo) {
      await avancarContadorAlemDe(nacional, input.numeroRps!)
      const desfecho = await consultarDpsNaSefin(input, config, prestador, cert)
      if (desfecho.tipo === 'existe') {
        return registrarReconciliada({ ...ctx, input }, desfecho.resultado, 'dps_duplicada')
      }
      if (desfecho.tipo !== 'outra_nota') {
        // Não achou: segue como erro (o rascunho fica a confirmar pela rotina).
        resultado.codigoErro = 'NAO_CONFIRMADA'
        resultado.erro = `${resultado.erro ?? ''} A consulta da DPS não confirmou a nota (${desfecho.tipo === 'indefinido' ? desfecho.erro : 'não encontrada'}) — a plataforma tenta confirmar de novo em até 15 minutos.`.trim()
        break
      }
      novo = true
    }
    const proximo = saltos < MAX_SALTOS_COLISAO && Date.now() - inicio < ORCAMENTO_SALTOS_MS
      ? await renumerarAposColisao(input.rascunhoId, travaId, nacional, input.numeroRps!)
      : null
    if (!proximo) {
      // Sem número livre dentro do orçamento: o contador já passou dos números
      // colididos; o rascunho perde o número (que é de outra nota) para a
      // próxima tentativa alocar um novo, sem consulta prévia enganosa.
      limparNumero = true
      resultado.codigoErro = 'DPS_NUMERO_EM_USO'
      resultado.erro = `A DPS nº ${input.numeroRps} (série ${input.serieRps}) já foi usada fora da plataforma — o cliente provavelmente emitiu notas pelo site/app do Emissor Nacional. ${saltos > 0 ? `A plataforma avançou a numeração ${saltos} vez(es) sem achar número livre. ` : ''}Em Configuração fiscal → Ambiente Nacional, informe o próximo número da DPS (o seguinte ao da última nota emitida pelo governo nesta série) e emita de novo.`
      break
    }
    saltos++
    input = { ...input, numeroRps: proximo }
    resultado = await rotearEmissao(input, config, prestador, cert)
  }

  if (resultado.sucesso) {
    const { nfseId } = await gravarNotaEmitida(
      { input, config, cliente, uid, extrasNotaEmitida: ctx.opcoes.extrasNotaEmitida },
      resultado,
      'envio',
    )
    await aposGravarNota({ ...ctx, input }, nfseId, resultado, 'emissao_nfse_sucesso')
    const aviso = saltos > 0
      ? `Os números de DPS anteriores já tinham sido usados fora da plataforma (Emissor Nacional): esta nota saiu com a DPS nº ${input.numeroRps}.`
      : undefined
    return { ...resultado, nfseId, rascunhoId: input.rascunhoId, ...(aviso ? { mensagem: aviso } : {}) }
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
      ...(limparNumero ? { 'dados.numeroRps': null } : {}),
    })
  }
  await auditarSemFalhar({
    tenantId,
    actor,
    requisicao: ctx.opcoes.requisicao ?? null,
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
        actor: atorDaRequisicao(request),
        requisicao: requisicaoDoCallable(request),
      })
    } catch (err) {
      // Mensagem sanitizada (pode trazer texto da Sefin). Bloqueio da
      // pré-validação e erro do usuário = WARNING (não dispara o alerta de
      // falha de emissão); ERROR só para falha real.
      registrarFalhaEmissao('[emitirNfse] processarEmissao falhou:', err)
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
    await exigirSegundoFatorSeObrigatorio(request.auth)

    // Sem configuração fiscal o certificado iria para o Storage sem nenhum
    // registro apontando para ele (nem a senha): o arquivo ficava órfão e o
    // usuário via "sucesso". Confere ANTES de gravar qualquer coisa (M4).
    // Mesma leitura tolerante da emissão: o doc de id = clienteId, senão o
    // antigo mais recente — o A1 vai para a config que a emissão vai ler.
    const fiscalDoc = await localizarDocConfigFiscal(clienteId)
    if (!fiscalDoc) {
      throw new HttpsError('failed-precondition', 'Salve a configuração fiscal do cliente antes de enviar o certificado A1.')
    }
    const tenantId = requireEnvironmentTenant(fiscalDoc.data()?.tenantId, 'Configuração fiscal')

    let info: { valido: boolean; vencimento: Date; titular: string }
    try {
      info = await validarCert(pfxBase64, senha)
    } catch {
      throw new HttpsError('invalid-argument', 'Certificado inválido ou senha incorreta.')
    }

    if (!info.valido) {
      throw new HttpsError('invalid-argument', `Certificado vencido em ${info.vencimento.toLocaleDateString('pt-BR')}.`)
    }

    // Salva no Storage CIFRADO (AES-256-GCM, CREDENTIAL_KEY): antes o .pfx ia
    // em claro e só a senha era cifrada — quem lesse o bucket levava o A1.
    const path   = resolverCaminhoCertificado(clienteId)
    const { conteudo, metadata } = conteudoCertificadoParaStorage(pfxBase64)
    await getStorage().bucket().file(path).save(conteudo, {
      contentType: 'application/octet-stream',
      metadata:    { metadata: { ...metadata, titularCertificado: info.titular } },
    })

    // Criptografa a senha antes de salvar no Firestore
    const senhaCriptografada = encrypt(senha)
    const actor = atorDaRequisicao(request)

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
      requisicao: requisicaoDoCallable(request),
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
    await exigirSegundoFatorSeObrigatorio(request.auth)

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

// ─── Function: definirNumeracaoDps ────────────────────────────────────────────
// "Próximo número da DPS" por prestador/série: cliente que já emitiu pelo
// Emissor Nacional web/app na mesma série colidia (E0014) a cada nota, porque
// a plataforma começava do 1. Só avança: nunca abaixo do último já usado em
// dps_sequencias. Grava o contador e a config na MESMA transação.

export const definirNumeracaoDps = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const { clienteId, serie: serieRecebida, proximoNumero } = (request.data ?? {}) as {
      clienteId?: string
      serie?: string
      proximoNumero?: unknown
    }
    if (!clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatório.')
    const acesso = await assertCanAccessCliente(request.auth.uid, clienteId, 'fiscal')

    const fiscalDoc = await localizarDocConfigFiscal(clienteId)
    if (!fiscalDoc) throw new HttpsError('failed-precondition', 'Salve a configuração fiscal do cliente antes de definir a numeração da DPS.')
    const config = { clienteId, ...fiscalDoc.data() } as ConfigFiscalCliente
    const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')
    if (tenantId !== acesso.usuario.tenantId) throw new HttpsError('permission-denied', 'Configuração fiscal pertence a outro tenant.')

    const cliente = await getCliente(clienteId)
    let nacional: ContextoNumeracaoNacional
    try {
      nacional = contextoNumeracaoNacional({ ...config, serieDps: serieRecebida ?? config.serieDps }, cliente)
    } catch (err) {
      throw err instanceof HttpsError ? err : new HttpsError('failed-precondition', String(err))
    }
    const proximo = typeof proximoNumero === 'string' && /^\d+$/.test(proximoNumero.trim()) ? Number(proximoNumero.trim()) : proximoNumero

    const actor = atorDaRequisicao(request)
    const resultado = await db().runTransaction(async (tx) => {
      const seq = await tx.get(nacional.ref)
      const ultimoUsado = Number(seq.data()?.ultimoNumero ?? 0) || 0
      const erro = validarProximoNumeroDps(proximo, ultimoUsado)
      if (erro) throw new HttpsError('failed-precondition', erro)
      const numero = proximo as number
      tx.set(nacional.ref, {
        cnpj: nacional.cnpj,
        tpAmb: nacional.tpAmb,
        serie: nacional.serie,
        tenantId,
        ultimoNumero: numero - 1,
        ajustadoManualmenteEm: Timestamp.now(),
        ajustadoPorId: actor.id,
        atualizadoEm: Timestamp.now(),
      }, { merge: true })
      tx.update(fiscalDoc.ref, {
        serieDps: nacional.serie,
        proximoNumeroDps: numero,
        numeracaoDpsAjuste: { serie: nacional.serie, tpAmb: nacional.tpAmb },
        atualizadoEm: Timestamp.now(),
        atualizadoPorId: actor.id,
        atualizadoPorNome: actor.nome,
      })
      return { ultimoUsado, numero }
    })

    await writeAuditLog({
      tenantId,
      actor,
      requisicao: requisicaoDoCallable(request),
      entidade: 'clientes_fiscal',
      entidadeId: fiscalDoc.id,
      acao: 'definir_numeracao_dps',
      dadosAntes: { serieDps: config.serieDps ?? null, ultimoNumeroUsado: resultado.ultimoUsado },
      dadosDepois: { clienteId, serieDps: nacional.serie, tpAmb: nacional.tpAmb, proximoNumeroDps: resultado.numero },
      origem: 'cloud_function',
    })

    return {
      sucesso: true,
      serie: nacional.serie,
      ambiente: nacional.tpAmb === '1' ? 'producao' : 'homologacao',
      proximoNumero: resultado.numero,
      ultimoNumeroUsado: resultado.ultimoUsado,
    }
  }
)
