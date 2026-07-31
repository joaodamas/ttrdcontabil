/**
 * Webhook da Spedy — fecha o ciclo de vida da nota sem depender do polling.
 *
 * O que este endpoint resolve, e por que ele não é conveniência:
 *
 *  1. NOTA ÓRFÃ. O polling da emissão espera ~25s. Passou disso, a emissão
 *     devolve SPEDY_PROCESSANDO, o rascunho vira 'erro_integracao' — e a nota
 *     EXISTE na prefeitura. Alguém olha a tela, vê "erro" e reemite. O webhook
 *     é quem traz o desfecho verdadeiro dessa nota.
 *  2. TETO DE LOTE. Com 25s presos por nota, um lote de 9 min não passa de ~19
 *     notas. Sem esperar resposta, o limite passa a ser o da API.
 *  3. IBS/CBS. A Spedy CALCULA os valores da reforma e os devolve em `totals`;
 *     até aqui eles eram lidos e jogados fora. É este evento que os persiste.
 *
 * SEGURANÇA: endpoint público. Segue o padrão de whatsapp/webhook.ts — valida a
 * credencial ANTES de tocar em qualquer coisa e é fail-closed em todos os
 * caminhos (sem segredo configurado, recusa tudo). Além disso, o corpo do POST
 * NÃO é fonte de verdade: ele só diz "a nota X mudou"; o status, o número e os
 * totais são relidos da API da Spedy com a chave do próprio cliente. Assim, um
 * POST forjado que passasse pela credencial ainda não conseguiria escrever um
 * número de nota fiscal inventado no histórico do escritório.
 */
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import { CREDENTIAL_KEY_SECRET } from './secrets'
import { DEFAULT_TENANT_ID } from '../tenant'
import { redactAuditData, writeAuditLog, SYSTEM_ACTOR } from '../audit'
import { normalizarRascunho } from './ciclo'
import {
  chaveEventoWebhook,
  COLECAO_REGISTRO_SPEDY,
  conferirCredencialWebhook,
  ehStatusTerminal,
  extrairEventoSpedy,
  extrairTotaisIbsCbs,
  mapearStatusSpedy,
  type EventoSpedy,
  type StatusNfseLocal,
} from './provedores/spedy-evento'
import type { ConfigFiscalCliente } from './types'

const db = () => admin.firestore()

/**
 * Segredo compartilhado do webhook.
 *
 * Declarado AQUI e não em secrets.ts pelo mesmo motivo que SPEDY_OWNER_API_KEY
 * mora em provisionar-spedy.ts: o `firebase deploy` resolve os secrets na fase
 * de análise, então um secret declarado num módulo que ninguém exporta não entra
 * no caminho do deploy.
 *
 * ⚠️ Este entra: a function abaixo É exportada em index.ts. Antes do próximo
 * deploy é obrigatório rodar
 *     firebase functions:secrets:set SPEDY_WEBHOOK_SECRET
 * ou o deploy inteiro aborta — o mesmo comportamento documentado no bloco do
 * WhatsApp em index.ts.
 */
const SPEDY_WEBHOOK_SECRET = defineSecret('SPEDY_WEBHOOK_SECRET')

const COLECAO_EVENTOS_WEBHOOK = 'nfse_webhook_events'

/**
 * Quantas vezes aceitamos que a releitura discorde do evento antes de desistir
 * de esperar. A Spedy pode anunciar 'authorized' e a leitura seguinte ainda
 * responder 'enqueued' (replicação). Devolver 503 faz a Spedy reenviar o POST;
 * insistir para sempre encheria a fila de retry dela, então depois deste teto a
 * gente aceita o que a API respondeu e segue.
 */
const MAX_TENTATIVAS_DIVERGENCIA = 3

// ─── Helpers de leitura (replicados de emitir.ts de propósito: aqui não pode
// lançar HttpsError — um throw vira 500 e a Spedy reenvia para sempre) ────────

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente | null> {
  const snap = await db().collection('clientes_fiscal')
    .where('clienteId', '==', clienteId)
    .limit(1)
    .get()
  if (snap.empty) return null
  const data = snap.docs[0].data()
  return { clienteId, ...data } as ConfigFiscalCliente
}

async function registrarEvento(params: {
  nfseId: string
  tipo: string
  mensagem: string
  detalhes?: Record<string, unknown>
  tenantId?: string
  clienteId?: string
}) {
  await db().collection('nfse_eventos').add({
    tenantId: params.tenantId ?? null,
    clienteId: params.clienteId ?? null,
    nfseId: params.nfseId,
    tipo: params.tipo,
    mensagem: params.mensagem,
    detalhes: params.detalhes ? redactAuditData(params.detalhes) : null,
    actorId: SYSTEM_ACTOR.id,
    origem: 'cloud_function',
    criadoEm: Timestamp.now(),
  }).catch((err) => {
    logger.error('[nfse/webhook-spedy] falha ao registrar evento', { erro: String(err) })
  })
}

// ─── Localização da nota local ────────────────────────────────────────────────
type ContextoNota = {
  clienteId: string
  tenantId?: string
  rascunhoId?: string
  competenciaId?: string
  numeroRps?: string
  serieRps?: string
  recurso: string
}

/**
 * Descobre de quem é a nota que o evento menciona.
 *
 * Caminho principal: o registro `nfse_spedy`, gravado pelo conector no instante
 * em que o id da Spedy passou a existir (antes até do polling). Caminho
 * secundário: o integrationId — que só serve quando ele É o id do rascunho,
 * porque acima de 36 caracteres a emissão manda um hash, e hash não volta.
 */
async function resolverContexto(evento: EventoSpedy): Promise<ContextoNota | null> {
  const registro = await db().collection(COLECAO_REGISTRO_SPEDY).doc(evento.invoiceId).get()
  if (registro.exists) {
    const dados = registro.data() ?? {}
    const clienteId = dados.clienteId as string | undefined
    if (clienteId) {
      return {
        clienteId,
        tenantId: (dados.tenantId as string | undefined) ?? undefined,
        rascunhoId: (dados.rascunhoId as string | undefined) ?? undefined,
        competenciaId: (dados.competenciaId as string | undefined) ?? undefined,
        numeroRps: (dados.numeroRps as string | undefined) ?? undefined,
        serieRps: (dados.serieRps as string | undefined) ?? undefined,
        recurso: (dados.recurso as string | undefined) ?? evento.recurso,
      }
    }
  }

  if (evento.integrationId) {
    const rascunho = await db().collection('nfse_rascunhos').doc(evento.integrationId).get()
    if (rascunho.exists) {
      const dados = rascunho.data() ?? {}
      const clienteId = dados.clienteId as string | undefined
      if (clienteId) {
        return {
          clienteId,
          tenantId: dados.tenantId as string | undefined,
          rascunhoId: rascunho.id,
          competenciaId: dados.competenciaId as string | undefined,
          numeroRps: (dados.dados as Record<string, unknown> | undefined)?.numeroRps as string | undefined,
          serieRps: (dados.dados as Record<string, unknown> | undefined)?.serieRps as string | undefined,
          recurso: evento.recurso,
        }
      }
    }
  }

  return null
}

/**
 * 'processando' no rascunho é o lock que a transação de emitir.ts segura
 * enquanto a nota está sendo enviada. Enquanto ele existir, quem grava a
 * `nfse_emitidas` é aquela execução — não o webhook.
 */
async function emissaoEmAndamento(rascunhoId: string | undefined): Promise<boolean> {
  if (!rascunhoId) return false
  const snap = await db().collection('nfse_rascunhos').doc(rascunhoId).get()
  return snap.exists && snap.data()?.status === 'processando'
}

async function localizarNfseEmitida(params: {
  tenantId?: string
  invoiceId: string
  rascunhoId?: string
}): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const porId = await db().collection('nfse_emitidas')
    .where('spedyInvoiceId', '==', params.invoiceId)
    .limit(1)
    .get()
  if (!porId.empty) return porId.docs[0]

  if (params.rascunhoId) {
    // Igualdade em campo único (índice automático). O filtro de tenant fica em
    // memória de propósito: compor dois where exigiria índice em
    // firestore.indexes.json, que é de outro módulo.
    const porRascunho = await db().collection('nfse_emitidas')
      .where('rascunhoId', '==', params.rascunhoId)
      .limit(5)
      .get()
    const doc = porRascunho.docs.find((d) => !params.tenantId || d.data().tenantId === params.tenantId)
    if (doc) return doc
  }
  return null
}

// ─── Aplicação do desfecho na nota ────────────────────────────────────────────
type Desfecho = {
  statusLocal: StatusNfseLocal
  numeroNfse?: string
  codigoVerificacao?: string
  mensagemErro?: string
  codigoErro?: string
}

function lerDesfecho(nota: Record<string, unknown> | null): Desfecho {
  const statusLocal = mapearStatusSpedy(nota?.status as string | undefined)
  const autorizacao = nota?.authorization as Record<string, unknown> | undefined
  const detalhe = nota?.processingDetail as Record<string, unknown> | undefined
  return {
    statusLocal,
    numeroNfse: (nota?.number as string | number | undefined)?.toString(),
    codigoVerificacao: (autorizacao?.protocol as string | undefined) ?? undefined,
    mensagemErro: detalhe?.message as string | undefined,
    codigoErro: detalhe?.code as string | undefined,
  }
}

/**
 * Cria a `nfse_emitidas` que a emissão não chegou a gravar.
 *
 * É o conserto da nota órfã: emissão cujo polling estourou não passa pelo ramo
 * de sucesso de emitir.ts, então a nota existe na prefeitura e não existe no
 * histórico. Os dados denormalizados vêm do rascunho — a mesma origem que a
 * emissão usaria.
 */
async function criarNfseEmitidaDoRascunho(params: {
  contexto: ContextoNota
  config: ConfigFiscalCliente
  invoiceId: string
  desfecho: Desfecho
  extras: Record<string, unknown>
}): Promise<string | null> {
  const { contexto, config, invoiceId, desfecho, extras } = params
  if (!contexto.rascunhoId) return null

  const snap = await db().collection('nfse_rascunhos').doc(contexto.rascunhoId).get()
  if (!snap.exists) return null
  const dadosRascunho = snap.data() as Record<string, unknown>
  const input = normalizarRascunho(snap.id, dadosRascunho)
  const agora = Timestamp.now()

  const ref = await db().collection('nfse_emitidas').add({
    tenantId: contexto.tenantId ?? config.tenantId ?? null,
    clienteId: contexto.clienteId,
    clienteNome: (dadosRascunho.clienteNome as string | undefined) ?? null,
    competenciaId: contexto.competenciaId ?? input.competenciaId ?? null,
    rascunhoId: contexto.rascunhoId,
    tomadorNome: input.tomador.razaoSocial ?? null,
    tomadorCpfCnpj: input.tomador.cpfCnpj ?? null,
    descricaoServico: input.servico.discriminacao ?? null,
    codigoServico: input.servico.codigoServico ?? null,
    valorServico: input.servico.valorServico ?? null,
    aliquota: input.servico.aliquota ?? config.aliquotaPadrao ?? null,
    issRetido: Boolean(input.servico.issRetido),
    numeroNfse: desfecho.numeroNfse ?? null,
    codigoVerificacao: desfecho.codigoVerificacao ?? null,
    numeroRps: contexto.numeroRps ?? input.numeroRps ?? null,
    serieRps: contexto.serieRps ?? input.serieRps ?? null,
    municipioIbge: config.municipioIbge ?? null,
    municipioNome: config.municipioEmissor ?? null,
    status: desfecho.statusLocal,
    tentativas: 1,
    dataEmissao: agora,
    criadoEm: agora,
    criadoPorId: SYSTEM_ACTOR.id,
    origemEmissao: 'automatica',
    ambienteEmissao: config.ambienteEmissao ?? null,
    valorDeducoes: input.servico.valorDeducoes ?? 0,
    spedyInvoiceId: invoiceId,
    // Marca que esta nota foi materializada pelo webhook, e não pela emissão —
    // é o rastro de que houve nota órfã, e o que permite auditar quantas.
    origemRegistro: 'webhook_spedy',
    ...extras,
  })
  return ref.id
}

// ─── Function ─────────────────────────────────────────────────────────────────

export const webhookSpedy = onRequest(
  {
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
    secrets: [SPEDY_WEBHOOK_SECRET, CREDENTIAL_KEY_SECRET],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method_not_allowed')
      return
    }

    const credencial = conferirCredencialWebhook({
      segredo: process.env.SPEDY_WEBHOOK_SECRET,
      assinatura: req.header('x-spedy-signature') ?? req.header('x-signature') ?? req.header('x-hub-signature-256'),
      token: req.header('x-spedy-token') ?? req.header('x-webhook-token') ?? (typeof req.query.token === 'string' ? req.query.token : undefined),
      corpoBruto: req.rawBody,
    })
    if (!credencial.ok) {
      // Sem corpo no log: o POST rejeitado pode ser de terceiro e não é dado
      // que a plataforma tenha o direito de guardar.
      logger.warn('[nfse/webhook-spedy] POST recusado', { motivo: credencial.motivo })
      res.status(403).json({ ok: false, error: credencial.motivo ?? 'forbidden' })
      return
    }

    const evento = extrairEventoSpedy(req.body)
    if (!evento) {
      logger.warn('[nfse/webhook-spedy] POST autenticado sem id de nota — nada a processar.')
      res.status(200).json({ ok: true, ignorado: 'sem_id' })
      return
    }

    const chave = chaveEventoWebhook(evento)
    const eventoRef = db().collection(COLECAO_EVENTOS_WEBHOOK).doc(chave)

    // Idempotência: a Spedy reenvia o POST quando não recebe 200 a tempo. Sem
    // isto, o mesmo 'authorized' criaria uma segunda nota no histórico — e a
    // conciliação do financeiro passaria a cobrar duas vezes.
    const tentativas = await db().runTransaction(async (tx) => {
      const atual = await tx.get(eventoRef)
      if (atual.exists && atual.data()?.processado === true) return -1
      const jaTentou = (atual.data()?.tentativas as number | undefined) ?? 0
      tx.set(eventoRef, {
        tenantId: DEFAULT_TENANT_ID,
        spedyInvoiceId: evento.invoiceId,
        eventType: evento.status ?? evento.tipoEvento ?? 'desconhecido',
        // `?? {}` não é paranoia: corpo não-JSON chega como undefined, e o
        // Firestore rejeita undefined — o POST inteiro morreria em 500 e a
        // Spedy o reenviaria para sempre.
        payloadResumo: redactAuditData(req.body ?? {}),
        recebidoEm: FieldValue.serverTimestamp(),
        tentativas: FieldValue.increment(1),
        processado: false,
        dedupeKey: chave,
      }, { merge: true })
      return jaTentou + 1
    })

    if (tentativas === -1) {
      res.status(200).json({ ok: true, duplicado: true })
      return
    }

    try {
      const resultado = await processarEvento(evento, tentativas)
      if (resultado.reenviar) {
        // 503 sem marcar processado: a Spedy tenta de novo. É o caminho de
        // indisponibilidade — desistir aqui recriaria a nota órfã.
        await eventoRef.set({ ultimoMotivoAdiamento: resultado.motivo ?? null }, { merge: true })
        res.status(503).json({ ok: false, retry: true, motivo: resultado.motivo })
        return
      }
      await eventoRef.set({
        processado: true,
        processadoEm: FieldValue.serverTimestamp(),
        resultado: resultado.resumo ?? null,
      }, { merge: true })
      res.status(200).json({ ok: true, ...resultado.resumo })
    } catch (err) {
      logger.error('[nfse/webhook-spedy] falha ao processar evento', {
        spedyInvoiceId: evento.invoiceId,
        erro: err instanceof Error ? err.message : String(err),
      })
      // 500 deixa processado: false — a Spedy reenvia e a gente tenta de novo.
      res.status(500).json({ ok: false })
    }
  }
)

type ResultadoProcessamento = {
  reenviar?: boolean
  motivo?: string
  resumo?: Record<string, unknown>
}

async function processarEvento(evento: EventoSpedy, tentativas: number): Promise<ResultadoProcessamento> {
  const contexto = await resolverContexto(evento)

  if (!contexto) {
    // Evento que não dá para mapear não é descartado: fica gravado com a marca
    // de órfão para conciliação. Responder 200 é deliberado — a Spedy não tem
    // como resolver isto reenviando.
    logger.warn('[nfse/webhook-spedy] evento sem nota correspondente', {
      spedyInvoiceId: evento.invoiceId,
      integrationId: evento.integrationId ?? null,
    })
    await registrarEvento({
      nfseId: evento.invoiceId,
      tipo: 'webhook_spedy_orfao',
      mensagem: 'Webhook da Spedy recebido para uma nota sem registro local. Requer conciliação manual.',
      detalhes: { status: evento.status ?? null, integrationId: evento.integrationId ?? null },
    })
    return { resumo: { mapeado: false } }
  }

  const tenantId = contexto.tenantId ?? DEFAULT_TENANT_ID
  if (tenantId !== DEFAULT_TENANT_ID) {
    logger.warn('[nfse/webhook-spedy] evento de outro ambiente ignorado', { spedyInvoiceId: evento.invoiceId })
    return { resumo: { mapeado: false, motivo: 'outro_tenant' } }
  }

  const config = await getConfigFiscal(contexto.clienteId)
  if (!config) {
    await registrarEvento({
      nfseId: evento.invoiceId,
      tipo: 'webhook_spedy_erro',
      mensagem: 'Cliente sem configuração fiscal — não foi possível reler a nota na Spedy.',
      tenantId,
      clienteId: contexto.clienteId,
    })
    return { resumo: { mapeado: false, motivo: 'sem_config_fiscal' } }
  }

  const { lerNotaSpedy, reterDocumentosFiscais } = await import('./provedores/spedy')
  const leitura = await lerNotaSpedy(config, contexto.recurso, evento.invoiceId)

  if (!leitura.ok) {
    // 429/5xx/rede: a nota pode estar autorizada e a gente só não conseguiu
    // olhar. Peça reenvio em vez de decidir no escuro.
    const transitorio = leitura.status === 0 || leitura.status === 429 || leitura.status >= 500
    if (transitorio && tentativas <= MAX_TENTATIVAS_DIVERGENCIA) {
      return { reenviar: true, motivo: `spedy_http_${leitura.status}` }
    }
    await registrarEvento({
      nfseId: evento.invoiceId,
      tipo: 'webhook_spedy_erro',
      mensagem: `Não foi possível reler a nota na Spedy (HTTP ${leitura.status}).`,
      detalhes: { status: leitura.status },
      tenantId,
      clienteId: contexto.clienteId,
    })
    return { resumo: { mapeado: true, relido: false } }
  }

  const desfecho = lerDesfecho(leitura.body)

  // Divergência: o evento anunciou desfecho e a releitura ainda diz
  // "processando" (replicação da Spedy). Pede reenvio algumas vezes antes de
  // aceitar — gravar 'processando' e marcar o evento como consumido perderia o
  // único aviso que a Spedy iria mandar sobre esta nota.
  if (ehStatusTerminal(evento.statusLocal) && desfecho.statusLocal === 'processando' && tentativas <= MAX_TENTATIVAS_DIVERGENCIA) {
    return { reenviar: true, motivo: 'releitura_ainda_processando' }
  }

  if (desfecho.statusLocal === 'erro') {
    await registrarEvento({
      nfseId: evento.invoiceId,
      tipo: 'webhook_spedy_status_desconhecido',
      mensagem: `A Spedy respondeu um status desconhecido (${String(leitura.body?.status ?? 'vazio')}). Nenhuma alteração feita na nota.`,
      tenantId,
      clienteId: contexto.clienteId,
    })
    return { resumo: { mapeado: true, statusAplicado: null } }
  }

  if (desfecho.statusLocal === 'processando') {
    await db().collection(COLECAO_REGISTRO_SPEDY).doc(evento.invoiceId).set({
      status: 'processando',
      atualizadoEm: Timestamp.now(),
    }, { merge: true })
    return { resumo: { mapeado: true, statusAplicado: 'processando' } }
  }

  // ── Desfecho terminal ───────────────────────────────────────────────────────
  const extras: Record<string, unknown> = {
    spedyInvoiceId: evento.invoiceId,
    atualizadoEm: Timestamp.now(),
  }

  // Valores da reforma: calculados pela Spedy e, até aqui, descartados.
  const ibsCbs = extrairTotaisIbsCbs(leitura.body)
  if (ibsCbs) extras.ibsCbs = ibsCbs

  if (desfecho.statusLocal === 'emitida') {
    const retencao = await reterDocumentosFiscais({
      config,
      invoiceId: evento.invoiceId,
      recurso: contexto.recurso as 'service-invoices' | 'product-invoices' | 'consumer-invoices',
      nota: leitura.body ?? undefined,
      numeroNfse: desfecho.numeroNfse,
      clienteId: contexto.clienteId,
    })
    if (retencao.xmlStoragePath) extras.xmlStoragePath = retencao.xmlStoragePath
    if (retencao.pdfStoragePath) extras.pdfStoragePath = retencao.pdfStoragePath
    if (retencao.erros.length > 0) {
      // Falha de retenção NÃO vira check verde silencioso: fica registrada com
      // o motivo, porque o que está em jogo é a guarda de 5 anos do documento.
      extras.retencaoPendente = true
      extras.retencaoErro = retencao.erros.join(' | ').slice(0, 500)
      await registrarEvento({
        nfseId: evento.invoiceId,
        tipo: 'nfse_retencao_incompleta',
        mensagem: 'Nota autorizada, mas XML/PDF não foram retidos no Storage.',
        detalhes: { erros: retencao.erros },
        tenantId,
        clienteId: contexto.clienteId,
      })
    } else {
      extras.retencaoPendente = false
      extras.retencaoErro = null
    }
  }

  const existente = await localizarNfseEmitida({
    tenantId,
    invoiceId: evento.invoiceId,
    rascunhoId: contexto.rascunhoId,
  })

  let nfseId: string | null = null
  let criada = false

  if (existente) {
    nfseId = existente.id
    await existente.ref.update({
      status: desfecho.statusLocal,
      numeroNfse: desfecho.numeroNfse ?? existente.data().numeroNfse ?? null,
      codigoVerificacao: desfecho.codigoVerificacao ?? existente.data().codigoVerificacao ?? null,
      erroUltimaConsulta: desfecho.statusLocal === 'rejeitada' ? (desfecho.mensagemErro ?? 'Nota recusada pela prefeitura.') : null,
      codigoErroUltimaConsulta: desfecho.statusLocal === 'rejeitada' ? (desfecho.codigoErro ?? null) : null,
      canceladoEm: desfecho.statusLocal === 'cancelada' ? Timestamp.now() : (existente.data().canceladoEm ?? null),
      ...extras,
    })
  } else if (desfecho.statusLocal === 'emitida') {
    // Corrida com a própria emissão: se o rascunho ainda está sob o lock de
    // processarEmissao ('processando'), aquela execução vai gravar a
    // `nfse_emitidas` daqui a instantes. Criar agora deixaria DUAS notas no
    // histórico da mesma competência — e o financeiro cobraria duas vezes.
    // Pedir reenvio é barato; o evento volta quando a emissão já terminou.
    if (await emissaoEmAndamento(contexto.rascunhoId) && tentativas <= MAX_TENTATIVAS_DIVERGENCIA) {
      return { reenviar: true, motivo: 'emissao_em_andamento' }
    }
    // Só materializa nota nova quando ela foi AUTORIZADA. Nota recusada que
    // nunca existiu no histórico não deve nascer como 'rejeitada' — ela já está
    // representada pelo rascunho em erro, e criar aqui duplicaria o registro.
    nfseId = await criarNfseEmitidaDoRascunho({ contexto, config, invoiceId: evento.invoiceId, desfecho, extras })
    criada = nfseId != null
  }

  // Rascunho: o desfecho da nota manda no status dele. Sem isto, a nota
  // autorizada pelo webhook continuaria aparecendo como 'erro_integracao' na
  // tela Fiscal, e o cron do dia seguinte a colocaria de volta na fila.
  if (contexto.rascunhoId) {
    const atualizacaoRascunho: Record<string, unknown> = { atualizadoEm: Timestamp.now(), atualizadoPorId: SYSTEM_ACTOR.id }
    if (desfecho.statusLocal === 'emitida') {
      atualizacaoRascunho.status = 'emitida'
      atualizacaoRascunho.erroUltimaTentativa = null
      atualizacaoRascunho.codigoErroUltimaTentativa = null
    } else if (desfecho.statusLocal === 'rejeitada') {
      atualizacaoRascunho.status = 'erro_integracao'
      atualizacaoRascunho.erroUltimaTentativa = desfecho.mensagemErro ?? 'Nota recusada pela prefeitura.'
      atualizacaoRascunho.codigoErroUltimaTentativa = desfecho.codigoErro ?? null
    } else if (desfecho.statusLocal === 'cancelada') {
      atualizacaoRascunho.status = 'cancelada'
    }
    await db().collection('nfse_rascunhos').doc(contexto.rascunhoId)
      .update(atualizacaoRascunho)
      .catch((err) => {
        logger.error('[nfse/webhook-spedy] falha ao atualizar rascunho', {
          rascunhoId: contexto.rascunhoId,
          erro: String(err),
        })
      })
  }

  await db().collection(COLECAO_REGISTRO_SPEDY).doc(evento.invoiceId).set({
    status: desfecho.statusLocal,
    numeroNfse: desfecho.numeroNfse ?? null,
    protocolo: desfecho.codigoVerificacao ?? null,
    nfseId: nfseId ?? null,
    atualizadoEm: Timestamp.now(),
  }, { merge: true })

  await registrarEvento({
    nfseId: nfseId ?? evento.invoiceId,
    tipo: `webhook_spedy_${desfecho.statusLocal}`,
    mensagem: criada
      ? 'Nota confirmada pelo webhook da Spedy e registrada no histórico (não havia sido gravada na emissão).'
      : 'Status da nota atualizado pelo webhook da Spedy.',
    detalhes: {
      spedyInvoiceId: evento.invoiceId,
      numeroNfse: desfecho.numeroNfse ?? null,
      statusSpedy: leitura.body?.status ?? null,
      ibsCbs: ibsCbs ?? null,
    },
    tenantId,
    clienteId: contexto.clienteId,
  })

  await writeAuditLog({
    tenantId,
    actor: SYSTEM_ACTOR,
    entidade: 'nfse_emitidas',
    entidadeId: nfseId ?? evento.invoiceId,
    acao: `webhook_spedy_${desfecho.statusLocal}`,
    dadosDepois: {
      clienteId: contexto.clienteId,
      spedyInvoiceId: evento.invoiceId,
      numeroNfse: desfecho.numeroNfse ?? null,
      notaCriadaPeloWebhook: criada,
      retencaoPendente: extras.retencaoPendente ?? null,
    },
    origem: 'cloud_function',
  }).catch((err) => {
    logger.error('[nfse/webhook-spedy] falha ao gravar auditoria', { erro: String(err) })
  })

  return { resumo: { mapeado: true, statusAplicado: desfecho.statusLocal, notaCriada: criada } }
}
