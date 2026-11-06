/**
 * Reconciliação da emissão pelo Ambiente Nacional: registrar em nfse_emitidas
 * uma nota que JÁ EXISTE na Sefin (timeout pós-envio, DPS repetida — E0014 —,
 * function que morreu no meio) em vez de reenviar e gerar outra.
 *
 * Usada por emitir.ts (antes de reenviar um nDPS reaproveitado e ao receber
 * E0014) e pela rotina de 15 min (scheduler/nfse-reconciliacao.ts).
 */
import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { rotearConsulta } from './municipios/router'
import { resolverProvedorNfse } from './provedor'
import { chaveAcessoValida } from './provedores/chave'
import { normalizarRascunho } from './normalizar-rascunho'
import { TRAVA_EMISSAO_MS, travaVencida } from './regras-emissao'
import { numeroDpsValido, serieDpsValida } from './nacional/numeracao'
import { getCertificado, getCliente, getConfigFiscal, montarPrestador } from './contexto'
import { SYSTEM_ACTOR } from '../audit'
import type {
  CertificadoA1, ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao, ResultadoOperacaoNfse,
} from './types'

const db = () => admin.firestore()

export const COLECAO_RASCUNHOS = 'nfse_rascunhos'

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

export interface ContextoNota {
  input: EmitirNfseInput
  config: ConfigFiscalCliente
  cliente: Record<string, unknown>
  uid: string
  extrasNotaEmitida?: Record<string, unknown>
}

type ResultadoComNota = Pick<ResultadoEmissao, 'numeroNfse' | 'codigoVerificacao' | 'chaveAcesso' | 'idDps' | 'xmlNfse' | 'pdfUrl'>
  & { status?: ResultadoOperacaoNfse['status'] }

/**
 * Grava a nota em nfse_emitidas e marca o rascunho como emitido — idempotente:
 *  - nota já registrada para o rascunho → só confirma o rascunho;
 *  - com chave de acesso, o id do documento é `NFS{chave}`: dois gravadores
 *    simultâneos da MESMA nota (envio + rotina) caem no mesmo documento.
 * Nota e rascunho mudam na MESMA transação (antes eram duas escritas soltas: a
 * function morrendo entre elas deixava a nota órfã e o rascunho na fila).
 */
export async function gravarNotaEmitida(
  ctx: ContextoNota,
  resultado: ResultadoComNota,
  origem: 'envio' | 'reconciliacao',
): Promise<{ nfseId: string; criada: boolean }> {
  const { input, config, cliente, uid } = ctx
  const rascunhoId = input.rascunhoId
  const rascunhoRef = rascunhoId ? db().collection(COLECAO_RASCUNHOS).doc(rascunhoId) : null
  const now = Timestamp.now()
  const marcarRascunho = {
    status: 'emitida',
    erroUltimaTentativa: null,
    codigoErroUltimaTentativa: null,
    detalhesUltimaTentativa: null,
    requestResumoUltimaTentativa: null,
    travaId: null,
    travaExpiraEm: null,
    ultimaTentativaEm: now,
    atualizadoEm: now,
    atualizadoPorId: uid,
  }

  if (rascunhoId) {
    const existente = await db().collection('nfse_emitidas').where('rascunhoId', '==', rascunhoId).limit(5).get()
    const daMesmaOrigem = existente.docs.find((d) => d.data().tenantId === config.tenantId && d.data().clienteId === input.clienteId)
    if (daMesmaOrigem) {
      await rascunhoRef!.update(marcarRascunho)
      return { nfseId: daMesmaOrigem.id, criada: false }
    }
  }

  const chave = [resultado.chaveAcesso, resultado.codigoVerificacao].find(chaveAcessoValida)
  const notaRef = chave ? db().collection('nfse_emitidas').doc(`NFS${chave}`) : db().collection('nfse_emitidas').doc()

  const nota = {
    tenantId:          config.tenantId,
    clienteId:         input.clienteId,
    clienteNome:       cliente.razaoSocial as string,
    competenciaId:     input.competenciaId ?? null,
    rascunhoId:        rascunhoId ?? null,
    tomadorNome:       input.tomador.razaoSocial,
    tomadorCpfCnpj:    input.tomador.cpfCnpj,
    // Campos abaixo existem para "Copiar de nota anterior" sem depender do
    // XML. Ausentes = null, nunca undefined.
    tomadorEmail:      input.tomador.email ?? null,
    tomadorEndereco:   enderecoParaGravar(input.tomador.endereco),
    descricaoServico:  input.servico.discriminacao,
    descricaoServicoModelo: input.servico.descricaoModelo?.trim() || null,
    itemListaServico:  input.servico.itemListaServico ?? null,
    codigoTributacaoNacional: input.servico.codigoTributacaoNacional?.trim() || null,
    codigoNbs:         input.servico.codigoNbs?.trim() || null,
    municipioPrestacaoIbge: input.servico.municipioPrestacao?.trim() || null,
    informacoesComplementares: input.servico.informacoesComplementares?.trim() || null,
    ibsCbsCst:         input.servico.ibsCbsCst?.trim() || null,
    ibsCbsClassTrib:   input.servico.ibsCbsClassTrib?.trim() || null,
    ibsCbsIndOp:       input.servico.ibsCbsIndOp?.trim() || null,
    dataCompetencia:   input.dataCompetencia ?? null,
    codigoServico:     input.servico.codigoServico,
    valorServico:      input.servico.valorServico,
    aliquota:          input.servico.aliquota ?? config.aliquotaPadrao ?? null,
    issRetido:         input.servico.issRetido,
    numeroNfse:        resultado.numeroNfse ?? null,
    codigoVerificacao: resultado.codigoVerificacao ?? chave ?? null,
    chaveAcesso:       resultado.chaveAcesso ?? chave ?? null,
    idDps:             resultado.idDps ?? null,
    provedorNfse:      resolverProvedorNfse(config),
    numeroRps:         input.numeroRps ?? null,
    serieRps:          input.serieRps ?? null,
    xmlNfse:           resultado.xmlNfse ?? null,
    pdfUrl:            resultado.pdfUrl ?? null,
    municipioIbge:     config.municipioIbge,
    municipioNome:     config.municipioEmissor,
    // Reconciliação pode encontrar a nota já cancelada na Sefin.
    status:            resultado.status === 'cancelada' ? 'cancelada' : 'emitida',
    tentativas:        1,
    dataEmissao:       now,
    criadoEm:          now,
    criadoPorId:       uid,
    // Distingue emissão pelo cron (uid === SYSTEM_ACTOR.id) de emissão por um
    // humano — usado no histórico/logs para mostrar a origem de cada nota.
    origemEmissao:     uid === SYSTEM_ACTOR.id ? 'automatica' : 'manual',
    // 'reconciliacao' = a nota foi ENCONTRADA na Sefin (timeout/E0014/rotina)
    // e registrada sem reenvio. Dados do tomador/serviço vêm do rascunho; os
    // fiscais (número, chave, XML) vêm da Sefin.
    registradaPor:     origem,
    ambienteEmissao:   config.ambienteEmissao,
    valorDeducoes:     input.servico.valorDeducoes ?? 0,
    ...(ctx.extrasNotaEmitida ?? {}),
  }

  const criada = await db().runTransaction(async (tx) => {
    const atual = await tx.get(notaRef)
    if (!atual.exists) tx.set(notaRef, nota)
    if (rascunhoRef) tx.update(rascunhoRef, marcarRascunho)
    return !atual.exists
  })
  return { nfseId: notaRef.id, criada }
}

/** Resultado de emissão a devolver quando a nota já existia (sem reenvio). */
export function resultadoDeNotaExistente(
  nota: Record<string, unknown>,
  extras: { nfseId: string; rascunhoId?: string; reconciliada?: boolean; mensagem: string },
): ResultadoEmissao {
  return {
    sucesso: true,
    numeroNfse: (nota.numeroNfse as string | null) ?? undefined,
    codigoVerificacao: (nota.codigoVerificacao as string | null) ?? undefined,
    chaveAcesso: (nota.chaveAcesso as string | null) ?? undefined,
    xmlNfse: (nota.xmlNfse as string | null) ?? undefined,
    nfseId: extras.nfseId,
    rascunhoId: extras.rascunhoId,
    jaEmitida: true,
    reconciliada: extras.reconciliada,
    mensagem: extras.mensagem,
  }
}

export type DesfechoConsultaDps =
  | { tipo: 'existe'; resultado: ResultadoOperacaoNfse }
  | { tipo: 'nao_existe' }
  | { tipo: 'indefinido'; erro: string; codigoErro?: string; detalhes?: string }

/** GET /dps/{id} (via roteador) para o nDPS gravado no input. */
export async function consultarDpsNaSefin(
  input: EmitirNfseInput,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  cert: CertificadoA1 | undefined,
): Promise<DesfechoConsultaDps> {
  if (!serieDpsValida(input.serieRps) || !numeroDpsValido(input.numeroRps)) return { tipo: 'nao_existe' }
  let r: ResultadoOperacaoNfse
  try {
    r = await rotearConsulta({
      nfseId: input.rascunhoId ?? input.numeroRps,
      clienteId: input.clienteId,
      numeroRps: input.numeroRps,
      serieRps: input.serieRps,
      rascunhoId: input.rascunhoId,
    }, config, prestador, cert)
  } catch (err) {
    return { tipo: 'indefinido', erro: err instanceof Error ? err.message : String(err) }
  }
  if (!r.sucesso) return { tipo: 'indefinido', erro: r.erro ?? 'Consulta da DPS falhou.', codigoErro: r.codigoErro, detalhes: r.detalhes }
  if (r.encontrada === false) return { tipo: 'nao_existe' }
  const chave = [r.chaveAcesso, r.codigoVerificacao].find(chaveAcessoValida)
  if (chave && (r.status === 'emitida' || r.status === 'cancelada')) return { tipo: 'existe', resultado: r }
  // Sucesso sem dizer se existe nem chave: não dá para afirmar nada.
  return { tipo: 'indefinido', erro: r.mensagem ?? 'A Sefin não confirmou se a DPS gerou nota.' }
}

// ─── Trava ──────────────────────────────────────────────────────────────────

export function novaTrava(agoraMs = Date.now()) {
  return { travaId: randomUUID(), travaExpiraEm: Timestamp.fromMillis(agoraMs + TRAVA_EMISSAO_MS) }
}

/**
 * Tira o rascunho de 'processando' com o erro desta tentativa — só se a trava
 * ainda for DESTA tentativa (outra tentativa que assumiu uma trava vencida não
 * pode ter o status sobrescrito por esta) e se ninguém o marcou como emitido.
 */
export async function liberarRascunhoComErro(
  rascunhoId: string,
  travaId: string | undefined,
  campos: Record<string, unknown>,
): Promise<boolean> {
  const ref = db().collection(COLECAO_RASCUNHOS).doc(rascunhoId)
  return db().runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    const d = atual.data()
    if (!d || d.status !== 'processando') return false
    if (travaId && d.travaId && d.travaId !== travaId) return false
    tx.update(ref, {
      status: 'erro_integracao',
      travaId: null,
      travaExpiraEm: null,
      ultimaTentativaEm: Timestamp.now(),
      atualizadoEm: Timestamp.now(),
      ...campos,
    })
    return true
  })
}

// ─── Rotina: rascunhos travados / sem confirmação ───────────────────────────

/** Códigos de erro em que a nota PODE ter saído — a rotina confirma na Sefin. */
export const CODIGOS_A_CONFIRMAR = ['SEFIN_SEM_RESPOSTA', 'NAO_CONFIRMADA'] as const

export const MAX_RECONCILIACOES_AUTOMATICAS = 12

export type DesfechoReconciliacao ='emitida' | 'nao_emitida' | 'indefinido' | 'ignorado'

/**
 * Reconcilia UM rascunho: 'processando' com trava vencida (function morreu) ou
 * 'erro_integracao' com código em CODIGOS_A_CONFIRMAR. Assume a trava em
 * transação (um clique simultâneo do usuário recebe "em processamento"),
 * consulta a DPS e:
 *  - nota existe → grava nfse_emitidas e marca o rascunho emitido;
 *  - não existe (consulta conclusiva) → 'erro_integracao' liberado para
 *    reenvio com o MESMO número;
 *  - inconclusivo → 'erro_integracao' / NAO_CONFIRMADA (a próxima rodada ou
 *    a próxima tentativa consultam de novo antes de enviar).
 * Provedor municipal (legado): só destrava, como fazia o alerta diário.
 */
export async function reconciliarRascunho(rascunhoId: string, agoraMs = Date.now()): Promise<DesfechoReconciliacao> {
  const ref = db().collection(COLECAO_RASCUNHOS).doc(rascunhoId)
  const trava = novaTrava(agoraMs)
  const travado = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.data()
    if (!d) return null
    const elegivel = d.status === 'processando'
      ? travaVencida({
          travaExpiraEmMs: (d.travaExpiraEm as Timestamp | null | undefined)?.toMillis?.() ?? null,
          atualizadoEmMs: (d.atualizadoEm as Timestamp | null | undefined)?.toMillis?.() ?? null,
        }, agoraMs)
      : d.status === 'erro_integracao'
        && (CODIGOS_A_CONFIRMAR as readonly string[]).includes(d.codigoErroUltimaTentativa as string)
        // Sefin fora do ar por horas (ou A1 vencido): para de insistir depois de
        // ~3 h; o rascunho continua na fila e qualquer tentativa consulta antes.
        && Number(d.tentativasReconciliacao ?? 0) < MAX_RECONCILIACOES_AUTOMATICAS
    if (!elegivel) return null
    tx.update(ref, {
      status: 'processando',
      ...trava,
      reconciliacaoEm: Timestamp.now(),
      tentativasReconciliacao: Number(d.tentativasReconciliacao ?? 0) + 1,
      atualizadoEm: Timestamp.now(),
    })
    return { ...d, statusAnterior: d.status } as Record<string, unknown>
  })
  if (!travado) return 'ignorado'

  const dados = (travado.dados ?? {}) as Record<string, unknown>
  const liberar = (campos: Record<string, unknown>) => liberarRascunhoComErro(rascunhoId, trava.travaId, campos)

  try {
    const input = normalizarRascunho(rascunhoId, travado)
    const nacionalComDps = dados.provedorRps === 'nacional' && numeroDpsValido(input.numeroRps) && serieDpsValida(input.serieRps)
    if (!nacionalComDps) {
      await liberar({
        erroUltimaTentativa: 'Emissão não concluiu em tempo hábil (travada em processamento) — liberada automaticamente para nova tentativa.',
        codigoErroUltimaTentativa: 'EMISSAO_INTERROMPIDA',
      })
      return 'nao_emitida'
    }

    const [config, cliente] = await Promise.all([getConfigFiscal(input.clienteId), getCliente(input.clienteId)])
    if (travado.tenantId !== config.tenantId) throw new Error('Rascunho de outro tenant.')
    const prestador = montarPrestador(config, cliente)
    const cert = await getCertificado(config)
    const desfecho = await consultarDpsNaSefin(input, config, prestador, cert)

    if (desfecho.tipo === 'existe') {
      await gravarNotaEmitida({ input, config, cliente, uid: SYSTEM_ACTOR.id }, { ...desfecho.resultado, idDps: undefined }, 'reconciliacao')
      return 'emitida'
    }
    if (desfecho.tipo === 'nao_existe') {
      await liberar({
        erroUltimaTentativa: `A emissão anterior não chegou a gerar nota na Sefin (DPS nº ${input.numeroRps} sem NFS-e). Pode emitir de novo — o mesmo número será usado.`,
        codigoErroUltimaTentativa: 'EMISSAO_NAO_GERADA',
      })
      return 'nao_emitida'
    }
    await liberar({
      erroUltimaTentativa: `Não foi possível confirmar na Sefin se a DPS nº ${input.numeroRps} gerou nota (${desfecho.erro}). A plataforma consulta de novo antes de qualquer reenvio — não crie outra nota.`,
      codigoErroUltimaTentativa: 'NAO_CONFIRMADA',
      detalhesUltimaTentativa: desfecho.detalhes ?? null,
    })
    return 'indefinido'
  } catch (err) {
    await liberar({
      erroUltimaTentativa: `Não foi possível confirmar a emissão na Sefin (${err instanceof Error ? err.message : String(err)}). A plataforma consulta de novo antes de qualquer reenvio.`,
      codigoErroUltimaTentativa: 'NAO_CONFIRMADA',
    }).catch(() => undefined)
    return 'indefinido'
  }
}
