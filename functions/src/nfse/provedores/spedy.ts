/**
 * Conector Spedy — API agregadora de NFS-e/NF-e (api.spedy.com.br)
 * Docs: https://docs.spedy.com.br/ (schema verbatim: https://api.spedy.com.br/llms.txt)
 *
 * Ao contrário dos conectores em ../municipios/*.ts (SOAP direto por prefeitura,
 * só 8 municípios), a Spedy cobre 1.200+ municípios via REST — usado quando
 * config.provedorNfse === 'spedy' (ver municipios/router.ts).
 *
 * Emissão é assíncrona no lado da Spedy (status inicial "enqueued"); fazemos
 * polling curto aqui para manter o mesmo contrato síncrono do restante do
 * pipeline (ResultadoEmissao). O polling deixou de ser a única saída: toda nota
 * criada aqui vira um registro em `nfse_spedy` (id da Spedy → cliente/rascunho),
 * que é o que permite ao webhook (../webhook-spedy.ts) fechar depois a nota que
 * o polling não esperou.
 */
import { createHash } from 'node:crypto'
import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { decrypt, isEncrypted } from '../encrypt'
import {
  caminhoArquivoFiscal,
  competenciaDaNota,
  mapearStatusSpedy,
  COLECAO_REGISTRO_SPEDY,
  type RecursoSpedy,
} from './spedy-evento'
import type {
  CancelarNfseInput,
  ConfigFiscalCliente,
  ConsultarNfseInput,
  EmitirConsumidorInput,
  EmitirNfseInput,
  EmitirProdutoInput,
  ItemProdutoFiscal,
  Prestador,
  ReformaIbsCbs,
  ResultadoEmissao,
  ResultadoOperacaoNfse,
  Tomador,
} from '../types'

const db = () => admin.firestore()

const SPEDY_API_PRODUCAO = 'https://api.spedy.com.br/v1'
// Sandbox real da Spedy: conta SEPARADA da de produção, criada em
// stage-app.spedy.com.br (Plano Desenvolvedor, gratuito), com sua própria
// X-API Key — só funciona no host abaixo (confirmado em 2026-07-07: uma
// chave de stage dá 401 em api.spedy.com.br, e vice-versa). A doc pública
// (docs.spedy.com.br) menciona "sandbox-api.spedy.com.br", que está
// desatualizada/errada — o nome real é "stage-api", confirmado por teste
// direto (curl sem credencial retornou 401, não erro de DNS) e pelo guia
// oficial "API Spedy — ambiente de testes.pdf".
const SPEDY_API_STAGE = 'https://stage-api.spedy.com.br/v1'

// Status "em andamento" — segue no polling. Qualquer outro valor é terminal.
const STATUS_EM_ANDAMENTO = new Set(['enqueued', 'created', 'received', 'inContingent'])
const STATUS_SUCESSO = 'authorized'

const POLL_INTERVALO_MS = 2500
const POLL_MAX_TENTATIVAS = 10 // ~25s de polling, dentro do timeout de 60s da function
// Teto para a espera ditada pelo x-rate-limit-reset: um reset distante (ou um
// relógio fora de sincronia) prenderia a function até o timeout sem esse limite.
const POLL_ESPERA_MAX_MS = 10_000

function baseUrl(config: ConfigFiscalCliente): string {
  return config.ambienteEmissao === 'homologacao' ? SPEDY_API_STAGE : SPEDY_API_PRODUCAO
}

function decryptApiKey(raw: string | undefined): string {
  if (!raw) {
    throw new Error('Chave de API da Spedy não configurada para este cliente. Configure em Clientes → Fiscal.')
  }
  if (!isEncrypted(raw)) {
    throw new Error('Chave de API da Spedy em formato legado (não criptografado). Reenvie a credencial.')
  }
  const chave = decrypt(raw)
  if (!chave) {
    throw new Error('Não foi possível descriptografar a chave de API da Spedy. Verifique o secret CREDENTIAL_KEY.')
  }
  return chave
}

type SpedyResposta = { resp: Response; body: Record<string, unknown> | null; bodyText: string }

async function spedyFetch(config: ConfigFiscalCliente, path: string, init: RequestInit): Promise<SpedyResposta> {
  const apiKey = decryptApiKey(config.credenciais?.spedyApiKey)
  const url = `${baseUrl(config)}${path}`
  console.log('[Spedy] chamando', {
    url,
    method: init.method ?? 'GET',
    apiKeyPresente: apiKey.length > 0,
    apiKeyTamanho: apiKey.length,
  })
  const resp = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      ...(init.headers ?? {}),
    },
  })
  const bodyText = await resp.text()
  let body: Record<string, unknown> | null = null
  try {
    body = bodyText ? JSON.parse(bodyText) : null
  } catch {
    // resposta não-JSON (ex: erro 5xx cru) — segue com body null, bodyText preserva o texto bruto
  }
  console.log('[Spedy] resposta', { url, status: resp.status, bodyPreview: bodyText.slice(0, 500) })
  return { resp, body, bodyText }
}

/**
 * Chave de idempotência da nota na Spedy (campo integrationId, máx. 36 chars).
 *
 * Precisa ser ESTÁVEL entre tentativas da mesma nota: é ela que permite, depois
 * de um polling que estourou, perguntar `GET /service-invoices?integrationId=x`
 * antes de reemitir — em vez de mandar um POST às cegas e duplicar a nota na
 * prefeitura. Sem isso a Spedy não tem como deduplicar (o numeroRps, que é a
 * proteção usada nos conectores municipais, não existe no payload dela).
 *
 * O rascunho é a identidade natural (um rascunho = uma nota). Mas o id
 * determinístico da recorrência é `tenant_ano_mes_cliente_servico` (ver
 * rascunhos.ts) e passa fácil dos 36 caracteres — daí o hash quando não cabe.
 * Emissão avulsa, sem rascunho, cai no par série+número do RPS.
 */
function integrationIdDe(input: { rascunhoId?: string; numeroRps?: string; serieRps?: string }): string | undefined {
  const base = input.rascunhoId
    ?? (input.numeroRps ? `${input.serieRps ?? 'RPS'}-${input.numeroRps}` : undefined)
  if (!base) return undefined
  return base.length <= 36 ? base : createHash('sha1').update(base).digest('hex').slice(0, 32)
}

/**
 * Monta o grupo `ibsCbs` da NFS-e, se houver enquadramento configurado.
 *
 * Precedência: o que veio na nota ganha do padrão do cliente — mesmo critério
 * já usado em `aliquota` e `itemListaServico` logo abaixo.
 *
 * Devolve `undefined` (e o campo some do payload) quando não há CST +
 * classificação válidos. Isso é deliberado: sem os dois, a Spedy aplica a Regra
 * de Tributação do painel. Enviar o grupo pela metade seria pior que não
 * enviar — vira rejeição na prefeitura em vez de fallback silencioso.
 *
 * `cst` e `classification` são inteiros na API, mas o cadastro antigo guardava
 * string (ProdutoRecord.ibsCbsCst/cClassTrib). Coagimos aqui para que um dado
 * legado não derrube a emissão — e descartamos o que não vira número.
 */
export function buildIbsCbs(
  nota: ReformaIbsCbs | undefined,
  padrao: ReformaIbsCbs | undefined,
): ReformaIbsCbs | undefined {
  const origem = nota ?? padrao
  if (!origem) return undefined

  const inteiro = (v: unknown): number | undefined => {
    const n = typeof v === 'string' ? Number(v.trim()) : v
    return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : undefined
  }

  const cst = inteiro(origem.cst)
  const classification = inteiro(origem.classification)
  if (cst === undefined || classification === undefined) return undefined

  return {
    cst,
    classification,
    ...(origem.operationIndicatorCode ? { operationIndicatorCode: origem.operationIndicatorCode } : {}),
    ...(typeof origem.isPersonalUse === 'boolean' ? { isPersonalUse: origem.isPersonalUse } : {}),
  }
}

function buildServiceInvoicePayload(input: EmitirNfseInput, config: ConfigFiscalCliente, prestador: Prestador) {
  const aliquota = input.servico.aliquota ?? config.aliquotaPadrao ?? 0
  const valor = input.servico.valorServico
  const issAmount = Number((valor * (aliquota / 100)).toFixed(2))
  const endereco = input.tomador.endereco
  const ibsCbs = buildIbsCbs(input.servico.reformaIbsCbs, config.reformaIbsCbs)

  return {
    integrationId: integrationIdDe(input),
    effectiveDate: new Date().toISOString().slice(0, 19),
    description: input.servico.discriminacao,
    federalServiceCode: input.servico.itemListaServico ?? config.itemListaServico ?? undefined,
    cityServiceCode: input.servico.codigoServico,
    sendEmailToCustomer: Boolean(input.tomador.email),
    receiver: {
      name: input.tomador.razaoSocial,
      federalTaxNumber: input.tomador.cpfCnpj.replace(/\D/g, ''),
      email: input.tomador.email || undefined,
      address: endereco
        ? {
            street: endereco.logradouro || undefined,
            number: endereco.numero || undefined,
            district: endereco.bairro || undefined,
            postalCode: endereco.cep?.replace(/\D/g, '') || undefined,
            city: {
              code: endereco.municipioIbge ?? prestador.municipioIbge,
              state: endereco.uf || undefined,
            },
          }
        : undefined,
    },
    total: {
      invoiceAmount: valor,
      issRate: Number((aliquota / 100).toFixed(4)),
      issAmount,
      issWithheld: input.servico.issRetido,
    },
    // Reforma Tributária: só entra no corpo quando há enquadramento. Ver buildIbsCbs.
    ...(ibsCbs ? { ibsCbs } : {}),
  }
}

// 429 (rate limit) e 5xx são transitórios. Desistir neles é o pior desfecho
// possível aqui: o POST já foi aceito, a nota EXISTE na Spedy, e reportar "erro"
// leva o operador a reemitir — duplicando a nota na prefeitura. Só 4xx que não
// seja 429 é resposta terminal.
function ehTransitorio(status: number): boolean {
  return status === 429 || status >= 500
}

// x-rate-limit-reset vem como data/hora UTC (não como segundos restantes, ao
// contrário do Retry-After usual). Respeitamos o tempo indicado, com teto, e
// caímos no intervalo padrão se vier ausente ou ilegível.
function esperaMs(resp: Response): number {
  const reset = resp.headers.get('x-rate-limit-reset')
  if (reset) {
    const faltam = Date.parse(reset) - Date.now()
    if (Number.isFinite(faltam) && faltam > 0) return Math.min(faltam, POLL_ESPERA_MAX_MS)
  }
  return POLL_INTERVALO_MS
}

/**
 * Procura na Spedy uma nota já criada com este integrationId.
 *
 * É a metade que faltava da idempotência: mandar o integrationId no POST não
 * impede duplicata sozinho — a Spedy não recusa dois POSTs com a mesma chave.
 * Quem impede é PERGUNTAR antes de criar.
 *
 * O caso que isso mata: o polling estoura (~25s) numa nota que a Spedy aceitou
 * e vai autorizar segundos depois; a emissão devolve SPEDY_PROCESSANDO, o
 * rascunho vira 'erro_integracao', e o cron do dia seguinte reprocessa. Sem
 * esta consulta, cada rodada emitia OUTRA nota fiscal real da mesma competência.
 *
 * Falha na consulta devolve `undefined` (desconhecido), não `null` (não existe)
 * — quem chama precisa distinguir "não achei" de "não consegui olhar", porque
 * seguir para o POST no segundo caso é justamente o que duplica a nota.
 */
async function buscarNotaPorIntegrationId(
  config: ConfigFiscalCliente,
  integrationId: string,
  resource: string,
): Promise<Record<string, unknown> | null | undefined> {
  const busca = await spedyFetch(
    config,
    `/${resource}?integrationId=${encodeURIComponent(integrationId)}&pageSize=5`,
    { method: 'GET' },
  ).catch(() => null)

  if (!busca || !busca.resp.ok) return undefined

  const itens = (busca.body?.items as Record<string, unknown>[] | undefined) ?? []
  // A busca por integrationId é um filtro, não uma chave — conferimos a
  // igualdade exata para não reaproveitar a nota errada num prefixo qualquer.
  const nota = itens.find((i) => i.integrationId === integrationId)
  return nota ?? null
}

/**
 * Obtém o id da nota na Spedy: reaproveita a que já existe para este
 * integrationId, ou cria uma nova. É o único ponto por onde os dois caminhos de
 * emissão (serviço e produto/consumidor) podem fazer POST.
 *
 * Quando não dá para consultar (rede fora, 5xx, 429), RECUSA em vez de criar.
 * É deliberado: falhar uma emissão é reversível — basta reprocessar; emitir uma
 * segunda nota fiscal da mesma competência não é, porque exige cancelamento
 * na prefeitura, uma a uma.
 */
type ResultadoCriacao = { id: string; reaproveitada: boolean } | { erro: ResultadoEmissao }

async function obterOuCriarNota(
  config: ConfigFiscalCliente,
  resource: string,
  payload: { integrationId?: string } & Record<string, unknown>,
): Promise<ResultadoCriacao> {
  const integrationId = payload.integrationId

  if (integrationId) {
    const existente = await buscarNotaPorIntegrationId(config, integrationId, resource)

    if (existente === undefined) {
      return {
        erro: {
          sucesso: false,
          codigoErro: 'SPEDY_CONSULTA_INDISPONIVEL',
          erro: 'Não foi possível confirmar na Spedy se esta nota já existe. A emissão foi interrompida para não gerar nota duplicada — tente novamente em instantes.',
          detalhes: integrationId,
        },
      }
    }

    if (existente) {
      const id = existente.id as string | undefined
      if (id) return { id, reaproveitada: true }
    }
  }

  const criacao = await spedyFetch(config, `/${resource}`, { method: 'POST', body: JSON.stringify(payload) })
  if (!criacao.resp.ok) {
    return {
      erro: {
        sucesso: false,
        codigoErro: `SPEDY_HTTP_${criacao.resp.status}`,
        erro: (criacao.body?.message as string | undefined) ?? `Spedy retornou HTTP ${criacao.resp.status} ao criar a nota.`,
        detalhes: criacao.bodyText.slice(0, 1000),
      },
    }
  }

  const id = criacao.body?.id as string | undefined
  if (!id) {
    return {
      erro: {
        sucesso: false,
        erro: 'Resposta da Spedy não trouxe o identificador da nota.',
        detalhes: criacao.bodyText.slice(0, 1000),
      },
    }
  }
  return { id, reaproveitada: false }
}

// ─── Registro id-da-Spedy → nota daqui (`nfse_spedy`) ─────────────────────────
/**
 * O webhook chega dizendo "a nota X mudou para authorized" e nada mais: o id é
 * da Spedy, não daqui. Sem um índice do id dela para o nosso cliente/rascunho,
 * o evento é ilegível — e o integrationId não resolve sozinho porque ele é
 * HASHEADO quando o id do rascunho passa de 36 caracteres (ver integrationIdDe),
 * e hash não volta.
 *
 * Por isso o registro nasce aqui, no instante em que o id da Spedy existe, e não
 * na gravação de `nfse_emitidas`: a nota órfã — aquela cujo polling estourou e
 * que NUNCA chegou a virar `nfse_emitidas` — é exatamente o caso que o webhook
 * precisa consertar.
 *
 * Best-effort de propósito: falhar aqui não pode derrubar uma emissão que já
 * aconteceu na prefeitura. Se o registro não for gravado, o webhook ainda tenta
 * o caminho do integrationId e, na pior das hipóteses, guarda o evento para
 * conciliação manual.
 */
export async function registrarNotaSpedy(params: {
  invoiceId: string
  recurso: RecursoSpedy
  config: ConfigFiscalCliente
  integrationId?: string
  rascunhoId?: string
  competenciaId?: string
  numeroRps?: string
  serieRps?: string
}): Promise<void> {
  try {
    await db().collection(COLECAO_REGISTRO_SPEDY).doc(params.invoiceId).set({
      tenantId: params.config.tenantId ?? null,
      clienteId: params.config.clienteId,
      recurso: params.recurso,
      integrationId: params.integrationId ?? null,
      rascunhoId: params.rascunhoId ?? null,
      competenciaId: params.competenciaId ?? null,
      numeroRps: params.numeroRps ?? null,
      serieRps: params.serieRps ?? null,
      municipioIbge: params.config.municipioIbge ?? null,
      ambienteEmissao: params.config.ambienteEmissao ?? null,
      atualizadoEm: Timestamp.now(),
    }, { merge: true })
  } catch (err) {
    console.error('[Spedy] falha ao registrar nota em nfse_spedy', {
      invoiceId: params.invoiceId,
      erro: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Índice reverso usado pela consulta/cancelamento: rascunho → id da Spedy. */
async function buscarRegistroPorRascunho(rascunhoId: string): Promise<{ id: string; recurso: RecursoSpedy } | null> {
  try {
    // Igualdade em campo único: usa o índice automático do Firestore, sem
    // depender de firestore.indexes.json (que não é deste módulo).
    const snap = await db().collection(COLECAO_REGISTRO_SPEDY)
      .where('rascunhoId', '==', rascunhoId)
      .limit(5)
      .get()
    const doc = snap.docs[0]
    if (!doc) return null
    return { id: doc.id, recurso: (doc.data().recurso as RecursoSpedy | undefined) ?? 'service-invoices' }
  } catch {
    return null
  }
}

async function pollAteTerminal(config: ConfigFiscalCliente, id: string, resource = 'service-invoices'): Promise<SpedyResposta | null> {
  for (let tentativa = 0; tentativa < POLL_MAX_TENTATIVAS; tentativa++) {
    const resultado = await spedyFetch(config, `/${resource}/${id}`, { method: 'GET' })
    if (!resultado.resp.ok) {
      if (!ehTransitorio(resultado.resp.status)) return resultado
      await new Promise((resolve) => setTimeout(resolve, esperaMs(resultado.resp)))
      continue
    }
    const status = (resultado.body?.status as string | undefined) ?? 'enqueued'
    if (!STATUS_EM_ANDAMENTO.has(status)) return resultado
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVALO_MS))
  }
  return null
}

// ── NF-e (produto) e NFC-e (consumidor) — builders + emissão genérica ─────────
// Fundação da Fase B. Reaproveita spedyFetch/polling do NFS-e e NÃO altera o
// caminho `emitir` (NFS-e), já validado. Ainda sem catálogo/tela/homologação —
// não emite ponta a ponta até isso existir. Totais e agregação de imposto podem
// precisar de ajuste contra uma emissão real de homologação da Spedy.
function buildReceiver(tomador: Tomador | undefined, prestador: Prestador) {
  if (!tomador) return undefined
  const endereco = tomador.endereco
  return {
    name: tomador.razaoSocial,
    federalTaxNumber: tomador.cpfCnpj.replace(/\D/g, ''),
    email: tomador.email || undefined,
    address: endereco
      ? {
          street: endereco.logradouro || undefined,
          number: endereco.numero || undefined,
          district: endereco.bairro || undefined,
          postalCode: endereco.cep?.replace(/\D/g, '') || undefined,
          city: { code: endereco.municipioIbge ?? prestador.municipioIbge, state: endereco.uf || undefined },
        }
      : undefined,
  }
}

function rateFrac(aliquota: number | undefined): number | undefined {
  return aliquota != null ? Number((aliquota / 100).toFixed(4)) : undefined
}

function buildItens(itens: ItemProdutoFiscal[]) {
  return itens.map((it) => ({
    code: it.codigo,
    description: it.descricao,
    ncm: it.ncm.replace(/\D/g, ''),
    cfop: it.cfop.replace(/\D/g, ''),
    unit: it.unidade,
    quantity: it.quantidade,
    unitAmount: it.valorUnitario,
    totalAmount: Number((it.quantidade * it.valorUnitario).toFixed(2)),
    taxes: {
      icms: {
        origin: it.icms.origem,
        cst: it.icms.cst,
        csosn: it.icms.csosn,
        baseTax: it.icms.baseCalculo,
        rate: rateFrac(it.icms.aliquota),
        amount: it.icms.valor,
        baseStRetentionAmount: it.icms.stBaseRetencao,
        stRetentionAmount: it.icms.stValorRetido,
      },
      pis: it.pis ? { cst: it.pis.cst, baseTax: it.pis.baseCalculo, rate: rateFrac(it.pis.aliquota), amount: it.pis.valor } : undefined,
      cofins: it.cofins ? { cst: it.cofins.cst, baseTax: it.cofins.baseCalculo, rate: rateFrac(it.cofins.aliquota), amount: it.cofins.valor } : undefined,
      ipi: it.ipi ? { cst: it.ipi.cst, rate: rateFrac(it.ipi.aliquota), amount: it.ipi.valor } : undefined,
    },
  }))
}

function buildProductInvoicePayload(input: EmitirProdutoInput, prestador: Prestador) {
  return {
    operationType: 'outgoing',
    destination: input.destino ?? 'internal',
    operationNature: input.naturezaOperacao,
    receiver: buildReceiver(input.tomador, prestador),
    items: buildItens(input.itens),
    payments: input.pagamentos?.map((p) => ({ method: p.metodo, amount: p.valor })),
  }
}

function buildConsumerInvoicePayload(input: EmitirConsumidorInput, prestador: Prestador) {
  return {
    isFinalCustomer: true,
    destination: 'internal',
    presenceType: input.presencial ? 'presence' : 'internet',
    operationNature: input.naturezaOperacao,
    receiver: buildReceiver(input.tomador, prestador),
    items: buildItens(input.itens),
    payments: input.pagamentos.map((p) => ({ method: p.metodo, amount: p.valor })),
  }
}

// Mesmo POST + polling + interpretação do NFS-e, parametrizado pelo recurso.
// Duplicado de propósito para não tocar em `emitir` (o caminho já validado).
async function emitirDocumento(config: ConfigFiscalCliente, resource: RecursoSpedy, payload: unknown): Promise<ResultadoEmissao> {
  try {
    const criacao = await obterOuCriarNota(config, resource, payload as { integrationId?: string } & Record<string, unknown>)
    if ('erro' in criacao) return criacao.erro
    const id = criacao.id
    await registrarNotaSpedy({
      invoiceId: id,
      recurso: resource,
      config,
      integrationId: (payload as { integrationId?: string }).integrationId,
    })
    const final = await pollAteTerminal(config, id, resource)
    if (!final) {
      return { sucesso: false, codigoErro: 'SPEDY_PROCESSANDO', erro: 'A Spedy ainda está processando a nota. Consulte novamente em instantes.', detalhes: id }
    }
    if (!final.resp.ok) {
      return {
        sucesso: false,
        codigoErro: `SPEDY_HTTP_${final.resp.status}`,
        erro: (final.body?.message as string | undefined) ?? `Spedy retornou HTTP ${final.resp.status}.`,
        detalhes: final.bodyText.slice(0, 1000),
      }
    }
    const status = (final.body?.status as string | undefined) ?? 'erro'
    const detalheProcessamento = final.body?.processingDetail as Record<string, unknown> | undefined
    if (status !== STATUS_SUCESSO) {
      return {
        sucesso: false,
        codigoErro: (detalheProcessamento?.code as string | undefined) ?? status,
        erro: (detalheProcessamento?.message as string | undefined) ?? `Spedy recusou a nota (status: ${status}).`,
        detalhes: final.bodyText.slice(0, 1000),
      }
    }
    const autorizacao = final.body?.authorization as Record<string, unknown> | undefined
    return {
      sucesso: true,
      numeroNfse: (final.body?.number as string | number | undefined)?.toString(),
      codigoVerificacao: (autorizacao?.protocol as string | undefined) ?? undefined,
    }
  } catch (err) {
    return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Ciclo de vida: consulta e cancelamento ──────────────────────────────────
/**
 * Entrada da consulta/cancelamento pela Spedy.
 *
 * Estende os tipos do ciclo com o que só existe no mundo da Spedy: o id da nota
 * lá dentro (`spedyInvoiceId`) e o rascunho que a originou. Os dois moram aqui
 * e no roteador — e não em ../types.ts — porque nenhum conector municipal tem
 * uso para eles.
 */
export type ChaveSpedy = { spedyInvoiceId?: string; rascunhoId?: string }
export type ConsultaSpedyInput = ConsultarNfseInput & ChaveSpedy
export type CancelamentoSpedyInput = CancelarNfseInput & ChaveSpedy

type NotaLocalizada = { id: string; recurso: RecursoSpedy } | { erro: ResultadoOperacaoNfse }

/**
 * Descobre QUAL nota da Spedy corresponde a este documento nosso.
 *
 * Ordem deliberada, da referência mais forte para a mais fraca:
 *  1. `spedyInvoiceId` gravado na nota (pelo webhook) — é o id em si;
 *  2. o registro `nfse_spedy` do rascunho — índice local, sem custo de API;
 *  3. o integrationId derivado do rascunho e, por fim, do par série+número do
 *     RPS — os mesmos usados na emissão (ver integrationIdDe).
 *
 * Quando a busca na Spedy falha (rede, 429, 5xx), devolve ERRO e não
 * "não encontrada": tratar indisponibilidade como ausência faria a consulta
 * afirmar que a nota não existe, e o retry em ciclo.ts usa exatamente essa
 * resposta para decidir reemitir.
 */
async function resolverNotaSpedy(
  config: ConfigFiscalCliente,
  input: ConsultaSpedyInput,
): Promise<NotaLocalizada> {
  if (input.spedyInvoiceId) {
    // O recurso vem do registro quando ele existe: NFS-e é o único caminho do
    // ciclo hoje, mas mandar um id de product-invoice para /service-invoices
    // devolveria 404 e viraria "nota não localizada" — erro que mente.
    const registro = await db().collection(COLECAO_REGISTRO_SPEDY).doc(input.spedyInvoiceId).get().catch(() => null)
    return {
      id: input.spedyInvoiceId,
      recurso: (registro?.data()?.recurso as RecursoSpedy | undefined) ?? 'service-invoices',
    }
  }

  if (input.rascunhoId) {
    const registro = await buscarRegistroPorRascunho(input.rascunhoId)
    if (registro) return registro
  }

  const candidatos = [
    integrationIdDe({ rascunhoId: input.rascunhoId }),
    integrationIdDe({ numeroRps: input.numeroRps, serieRps: input.serieRps }),
  ].filter((c): c is string => Boolean(c))

  let indisponivel = false
  for (const integrationId of candidatos) {
    const achada = await buscarNotaPorIntegrationId(config, integrationId, 'service-invoices')
    if (achada === undefined) {
      indisponivel = true
      continue
    }
    const id = achada?.id as string | undefined
    if (id) return { id, recurso: 'service-invoices' }
  }

  if (indisponivel) {
    return {
      erro: {
        sucesso: false,
        codigoErro: 'SPEDY_CONSULTA_INDISPONIVEL',
        erro: 'Não foi possível consultar a Spedy agora. Tente novamente em instantes.',
      },
    }
  }

  return {
    erro: {
      sucesso: false,
      codigoErro: 'SPEDY_NOTA_NAO_LOCALIZADA',
      erro: 'Não foi possível localizar esta nota na Spedy. Confirme se ela foi emitida por este provedor.',
    },
  }
}

/**
 * Releitura de uma nota na Spedy, para quem está fora do fluxo de emissão.
 *
 * Existe para o webhook: o corpo do POST diz apenas "a nota X mudou" e NÃO é
 * fonte de verdade — número, status e totais de IBS/CBS são lidos daqui, com a
 * chave de API do próprio cliente. Devolve `status: 0` quando nem chegou a
 * haver resposta HTTP (rede/timeout), que é o que distingue "não consegui
 * olhar" de "olhei e a Spedy recusou".
 */
export async function lerNotaSpedy(
  config: ConfigFiscalCliente,
  recurso: string,
  invoiceId: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null; texto: string }> {
  try {
    const leitura = await spedyFetch(config, `/${recurso}/${encodeURIComponent(invoiceId)}`, { method: 'GET' })
    return { ok: leitura.resp.ok, status: leitura.resp.status, body: leitura.body, texto: leitura.bodyText.slice(0, 1000) }
  } catch (err) {
    return { ok: false, status: 0, body: null, texto: err instanceof Error ? err.message : String(err) }
  }
}

/** Traduz o corpo de uma nota da Spedy no contrato do ciclo (ResultadoOperacaoNfse). */
export function interpretarNota(body: Record<string, unknown> | null, invoiceId: string): ResultadoOperacaoNfse {
  const statusSpedy = body?.status as string | undefined
  const status = mapearStatusSpedy(statusSpedy)
  const detalhe = body?.processingDetail as Record<string, unknown> | undefined
  const autorizacao = body?.authorization as Record<string, unknown> | undefined
  const numeroNfse = (body?.number as string | number | undefined)?.toString()
  const codigoVerificacao = (autorizacao?.protocol as string | undefined) ?? undefined

  // Status que não conhecemos NÃO vira check verde nem erro definitivo: vira
  // falha explícita, com o valor cru no texto, para o operador ver o que a
  // Spedy respondeu em vez de um "emitida" inventado.
  if (status === 'erro') {
    return {
      sucesso: false,
      codigoErro: 'SPEDY_STATUS_DESCONHECIDO',
      erro: `A Spedy respondeu um status que a plataforma ainda não conhece (${statusSpedy ?? 'vazio'}). Nenhuma alteração foi feita na nota.`,
      detalhes: invoiceId,
    }
  }

  if (status === 'rejeitada') {
    return {
      sucesso: true,
      status: 'rejeitada',
      mensagem: (detalhe?.message as string | undefined) ?? `Nota recusada (status ${statusSpedy}).`,
      codigoErro: (detalhe?.code as string | undefined) ?? statusSpedy,
      numeroNfse,
      codigoVerificacao,
    }
  }

  if (status === 'processando') {
    return {
      sucesso: true,
      status: 'processando',
      mensagem: `A Spedy ainda está processando a nota (status ${statusSpedy}).`,
      detalhes: invoiceId,
    }
  }

  return {
    sucesso: true,
    status,
    mensagem: status === 'cancelada' ? 'NFS-e cancelada na prefeitura.' : 'NFS-e autorizada.',
    numeroNfse,
    codigoVerificacao,
  }
}

// ─── Retenção do documento fiscal (XML/PDF) ──────────────────────────────────
// Timeout curto e explícito: o download roda dentro da emissão, que tem 60s de
// orçamento total e já gastou até 25s no polling. Melhor não reter agora (o
// webhook e a consulta refazem) do que estourar a function e perder o resultado
// de uma nota já autorizada na prefeitura.
const DOWNLOAD_TIMEOUT_MS = 8_000

async function baixarArquivoSpedy(
  config: ConfigFiscalCliente,
  recurso: RecursoSpedy,
  invoiceId: string,
  tipo: 'xml' | 'pdf',
): Promise<{ conteudo: Buffer; contentType: string } | { erro: string }> {
  const apiKey = decryptApiKey(config.credenciais?.spedyApiKey)
  const url = `${baseUrl(config)}/${recurso}/${invoiceId}/${tipo}`
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, Accept: tipo === 'pdf' ? 'application/pdf' : 'application/xml' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!resp.ok) return { erro: `HTTP ${resp.status} ao baixar ${tipo}` }

    const contentType = resp.headers.get('content-type') ?? ''
    const bytes = Buffer.from(await resp.arrayBuffer())

    // Alguns endpoints devolvem um JSON com link em vez do arquivo. Sem este
    // desvio, o que iria para o Storage seria o JSON — um "XML" de 80 bytes que
    // só se descobre inválido daqui a cinco anos, numa fiscalização.
    if (contentType.includes('application/json')) {
      let link: string | undefined
      try {
        const json = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
        link = (json.url ?? json.link ?? json.downloadUrl) as string | undefined
      } catch {
        return { erro: `Resposta JSON ilegível no download do ${tipo}` }
      }
      if (!link) return { erro: `Resposta JSON sem link de download do ${tipo}` }
      const arquivo = await fetch(link, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
      if (!arquivo.ok) return { erro: `HTTP ${arquivo.status} ao baixar ${tipo} pelo link` }
      return {
        conteudo: Buffer.from(await arquivo.arrayBuffer()),
        contentType: arquivo.headers.get('content-type') ?? (tipo === 'pdf' ? 'application/pdf' : 'application/xml'),
      }
    }

    if (bytes.length === 0) return { erro: `Download do ${tipo} veio vazio` }
    return { conteudo: bytes, contentType: contentType || (tipo === 'pdf' ? 'application/pdf' : 'application/xml') }
  } catch (err) {
    return { erro: err instanceof Error ? err.message : String(err) }
  }
}

export type RetencaoDocumentos = {
  xmlStoragePath?: string
  pdfStoragePath?: string
  erros: string[]
}

/**
 * Baixa XML e PDF da nota autorizada e grava em `nfse/{clienteId}/{ano}/{mes}/`.
 *
 * Escritório contábil tem guarda de 5 anos do documento fiscal e, até aqui, a
 * plataforma não retinha o arquivo de NENHUMA nota que ela mesma emitia — o
 * XML só existia dentro da Spedy. Perder o contrato com o provedor era perder o
 * acervo dos 119 clientes.
 *
 * Nunca lança: devolve os caminhos que conseguiu e a lista do que falhou. O
 * chamador decide o que fazer com a falha parcial (o webhook registra em
 * `nfse_eventos`), mas em nenhum caso ela invalida uma nota já autorizada.
 */
export async function reterDocumentosFiscais(params: {
  config: ConfigFiscalCliente
  invoiceId: string
  recurso: RecursoSpedy
  nota?: Record<string, unknown>
  numeroNfse?: string
  clienteId?: string
}): Promise<RetencaoDocumentos> {
  const resultado: RetencaoDocumentos = { erros: [] }
  const clienteId = params.clienteId ?? params.config.clienteId
  if (!clienteId) {
    resultado.erros.push('Cliente não identificado — retenção do documento fiscal não executada.')
    return resultado
  }

  const { ano, mes } = competenciaDaNota(params.nota)
  // Nome do arquivo pelo número da nota quando ele existe (é o que o contador
  // procura); o id da Spedy é só o fallback de nota sem número.
  const nome = params.numeroNfse ?? params.invoiceId

  for (const tipo of ['xml', 'pdf'] as const) {
    try {
      const caminho = caminhoArquivoFiscal({ clienteId, ano, mes, nome, extensao: tipo })
      const baixado = await baixarArquivoSpedy(params.config, params.recurso, params.invoiceId, tipo)
      if ('erro' in baixado) {
        resultado.erros.push(`${tipo.toUpperCase()}: ${baixado.erro}`)
        continue
      }
      await getStorage().bucket().file(caminho).save(baixado.conteudo, {
        contentType: baixado.contentType,
        metadata: { metadata: { clienteId, spedyInvoiceId: params.invoiceId, numeroNfse: nome } },
      })
      if (tipo === 'xml') resultado.xmlStoragePath = caminho
      else resultado.pdfStoragePath = caminho
    } catch (err) {
      resultado.erros.push(`${tipo.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (resultado.erros.length > 0) {
    console.error('[Spedy] retenção parcial do documento fiscal', {
      invoiceId: params.invoiceId,
      clienteId,
      erros: resultado.erros,
    })
  }

  // O caminho fica no registro `nfse_spedy` além de ir para `nfse_emitidas`:
  // a retenção também roda em caminhos que não gravam a nota (emissão cujo
  // polling estourou, consulta manual), e sem isto o arquivo existiria no
  // Storage sem nada apontando para ele.
  if (resultado.xmlStoragePath || resultado.pdfStoragePath) {
    await db().collection(COLECAO_REGISTRO_SPEDY).doc(params.invoiceId).set({
      clienteId,
      xmlStoragePath: resultado.xmlStoragePath ?? null,
      pdfStoragePath: resultado.pdfStoragePath ?? null,
      arquivosRetidosEm: Timestamp.now(),
    }, { merge: true }).catch((err) => {
      console.error('[Spedy] falha ao anotar caminho dos arquivos em nfse_spedy', {
        invoiceId: params.invoiceId,
        erro: err instanceof Error ? err.message : String(err),
      })
    })
  }

  return resultado
}

export class SpedyConector {
  async emitir(input: EmitirNfseInput, config: ConfigFiscalCliente, prestador: Prestador): Promise<ResultadoEmissao> {
    try {
      const payload = buildServiceInvoicePayload(input, config, prestador)
      // Nunca faz POST direto: obterOuCriarNota consulta o integrationId antes,
      // e reaproveita a nota que a rodada anterior deixou em processamento em
      // vez de emitir outra. Ver o comentário de buscarNotaPorIntegrationId.
      const criacao = await obterOuCriarNota(config, 'service-invoices', payload)
      if ('erro' in criacao) return criacao.erro
      const id = criacao.id

      // Índice id-da-Spedy → rascunho gravado ANTES do polling: se a function
      // morrer no meio (timeout, deploy, OOM), é este registro que deixa o
      // webhook fechar a nota depois. Gravar só no sucesso repetiria o bug da
      // nota órfã, que é justamente o que estamos matando.
      await registrarNotaSpedy({
        invoiceId: id,
        recurso: 'service-invoices',
        config,
        integrationId: payload.integrationId,
        rascunhoId: input.rascunhoId,
        competenciaId: input.competenciaId,
        numeroRps: input.numeroRps,
        serieRps: input.serieRps,
      })

      const final = await pollAteTerminal(config, id)
      if (!final) {
        // Não estourou erro — a nota segue "enqueued"/"created" na Spedy além do
        // tempo de polling. Deixou de ser nota órfã: o registro em `nfse_spedy`
        // acima já existe, então o webhook fecha esta nota quando a prefeitura
        // responder. O status daqui continua sendo "não sei" (nunca sucesso).
        return {
          sucesso: false,
          codigoErro: 'SPEDY_PROCESSANDO',
          erro: 'A Spedy ainda está processando a nota. O status será atualizado automaticamente quando a prefeitura responder.',
          detalhes: id,
        }
      }

      if (!final.resp.ok) {
        return {
          sucesso: false,
          codigoErro: `SPEDY_HTTP_${final.resp.status}`,
          erro: (final.body?.message as string | undefined) ?? `Spedy retornou HTTP ${final.resp.status} ao consultar a nota.`,
          detalhes: final.bodyText.slice(0, 1000),
        }
      }

      const status = (final.body?.status as string | undefined) ?? 'erro'
      const detalheProcessamento = final.body?.processingDetail as Record<string, unknown> | undefined

      if (status !== STATUS_SUCESSO) {
        return {
          sucesso: false,
          codigoErro: (detalheProcessamento?.code as string | undefined) ?? status,
          erro: (detalheProcessamento?.message as string | undefined) ?? `Spedy recusou a nota (status: ${status}).`,
          detalhes: final.bodyText.slice(0, 1000),
        }
      }

      const autorizacao = final.body?.authorization as Record<string, unknown> | undefined
      const numeroNfse = (final.body?.number as string | number | undefined)?.toString()

      // Guarda de 5 anos: o documento fiscal é baixado e retido no Storage já
      // na emissão. Best-effort — a nota está autorizada na prefeitura e não
      // pode ser reportada como falha porque um download não voltou; o que
      // falhar aqui é refeito pelo webhook e pelo botão Consultar.
      await reterDocumentosFiscais({
        config,
        invoiceId: id,
        recurso: 'service-invoices',
        nota: final.body ?? undefined,
        numeroNfse,
      })

      return {
        sucesso: true,
        numeroNfse,
        // A Spedy não expõe um "código de verificação" separado no schema
        // atual — usamos o protocolo de autorização como referência mais
        // próxima. Vale confirmar contra uma emissão real de sandbox.
        codigoVerificacao: (autorizacao?.protocol as string | undefined) ?? undefined,
      }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Consulta o status corrente da nota na Spedy. Antes de ler, dispara
   * `POST /{id}/check-status`, que força a Spedy a reperguntar à prefeitura —
   * ler direto devolveria o último status em cache dela, e a pergunta que o
   * contador faz ao clicar em "Consultar" é sobre a PREFEITURA.
   */
  async consultar(input: ConsultaSpedyInput, config: ConfigFiscalCliente): Promise<ResultadoOperacaoNfse> {
    try {
      const alvo = await resolverNotaSpedy(config, input)
      if ('erro' in alvo) return alvo.erro

      // Best-effort: 404/405 aqui (endpoint indisponível para o recurso) não
      // pode impedir a leitura do status, que é o que interessa.
      await spedyFetch(config, `/${alvo.recurso}/${alvo.id}/check-status`, { method: 'POST' }).catch(() => null)

      const leitura = await spedyFetch(config, `/${alvo.recurso}/${alvo.id}`, { method: 'GET' })
      if (!leitura.resp.ok) {
        return {
          sucesso: false,
          codigoErro: `SPEDY_HTTP_${leitura.resp.status}`,
          erro: (leitura.body?.message as string | undefined) ?? `Spedy retornou HTTP ${leitura.resp.status} ao consultar a nota.`,
          detalhes: leitura.bodyText.slice(0, 1000),
        }
      }

      const resultado = interpretarNota(leitura.body, alvo.id)
      // Consulta também serve de rede de segurança da retenção: nota autorizada
      // antes deste módulo existir (ou cujo download falhou) é retida agora.
      if (resultado.status === 'emitida') {
        await reterDocumentosFiscais({
          config,
          invoiceId: alvo.id,
          recurso: alvo.recurso,
          nota: leitura.body ?? undefined,
          numeroNfse: resultado.numeroNfse,
        })
      }
      return resultado
    } catch (err) {
      return { sucesso: false, codigoErro: 'SPEDY_EXCECAO', erro: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Cancela a nota na Spedy (`DELETE /{recurso}/{id}`).
   *
   * Não devolve 'cancelada' pelo 2xx do DELETE: cancelamento é assíncrono do
   * lado da prefeitura tanto quanto a emissão. Relemos o status e só quem
   * responder `cancelled` fecha como cancelada — o resto vira 'processando', que
   * o ciclo já sabe tratar (`cancelamento_pendente`).
   */
  async cancelar(input: CancelamentoSpedyInput, config: ConfigFiscalCliente): Promise<ResultadoOperacaoNfse> {
    try {
      const alvo = await resolverNotaSpedy(config, input)
      if ('erro' in alvo) return alvo.erro

      // O motivo vai como query string: o schema público documenta o DELETE
      // sem corpo, e a prefeitura exige justificativa. Confirmar o nome do
      // parâmetro (`reason`) contra um cancelamento real de homologação —
      // parâmetro ignorado não quebra a chamada, mas some da justificativa.
      const motivo = input.motivo?.trim()
      const query = motivo ? `?reason=${encodeURIComponent(motivo.slice(0, 255))}` : ''
      const exclusao = await spedyFetch(config, `/${alvo.recurso}/${alvo.id}${query}`, { method: 'DELETE' })

      if (!exclusao.resp.ok) {
        return {
          sucesso: false,
          codigoErro: `SPEDY_HTTP_${exclusao.resp.status}`,
          erro: (exclusao.body?.message as string | undefined) ?? `Spedy retornou HTTP ${exclusao.resp.status} ao cancelar a nota.`,
          detalhes: exclusao.bodyText.slice(0, 1000),
        }
      }

      const leitura = await spedyFetch(config, `/${alvo.recurso}/${alvo.id}`, { method: 'GET' }).catch(() => null)
      const status = leitura?.resp.ok ? mapearStatusSpedy(leitura.body?.status as string | undefined) : 'processando'

      if (status === 'cancelada') {
        return { sucesso: true, status: 'cancelada', mensagem: 'NFS-e cancelada na prefeitura.' }
      }
      return {
        sucesso: true,
        status: 'processando',
        mensagem: 'Cancelamento aceito pela Spedy; aguardando confirmação da prefeitura.',
        detalhes: alvo.id,
      }
    } catch (err) {
      return { sucesso: false, codigoErro: 'SPEDY_EXCECAO', erro: err instanceof Error ? err.message : String(err) }
    }
  }

  /** NF-e (produto, modelo 55). Fundação — depende de catálogo/tela/homologação. */
  async emitirProduto(input: EmitirProdutoInput, config: ConfigFiscalCliente, prestador: Prestador): Promise<ResultadoEmissao> {
    return emitirDocumento(config, 'product-invoices', buildProductInvoicePayload(input, prestador))
  }

  /** NFC-e (consumidor, modelo 65). Exige CSC/tokenId configurados na empresa (SEFAZ). */
  async emitirConsumidor(input: EmitirConsumidorInput, config: ConfigFiscalCliente, prestador: Prestador): Promise<ResultadoEmissao> {
    return emitirDocumento(config, 'consumer-invoices', buildConsumerInvoicePayload(input, prestador))
  }

  /**
   * Envia o certificado A1 (.pfx) da empresa para a Spedy assinar as notas
   * (a Spedy exige o certificado carregado p/ NF-e modelo 55). É a peça que leva
   * o certificado guardado na plataforma até a Spedy: a plataforma vira o cofre
   * único e alimenta a Spedy — o contador gerencia o A1 num lugar só.
   *
   * `POST /companies/{id}/certificates` é multipart/form-data (campos file +
   * password, conforme o schema) — por isso NÃO passa por spedyFetch, que envia
   * JSON. A auth usa a X-Api-Key da própria empresa (que já a identifica); o
   * companyId vem de config.spedyCompanyId (setado no provisionamento).
   *
   * ⚠️ Nomes dos campos multipart (file/password) e o uso da chave da empresa (vs
   * a Owner) são o melhor mapeamento do schema público; confirmar contra um upload
   * real de homologação antes de tratar como garantido.
   */
  async subirCertificado(
    config: ConfigFiscalCliente,
    companyId: string,
    pfxBase64: string,
    senha: string,
  ): Promise<{ sucesso: boolean; status: number; erro?: string; detalhes?: string }> {
    try {
      const apiKey = decryptApiKey(config.credenciais?.spedyApiKey)
      const url = `${baseUrl(config)}/companies/${encodeURIComponent(companyId)}/certificates`
      const pfxBytes = Buffer.from(pfxBase64, 'base64')
      const form = new FormData()
      form.append('file', new Blob([pfxBytes], { type: 'application/x-pkcs12' }), 'certificado.pfx')
      form.append('password', senha)
      // Sem Content-Type manual: o fetch/undici define o boundary do multipart.
      const resp = await fetch(url, { method: 'POST', headers: { 'X-Api-Key': apiKey }, body: form })
      const bodyText = await resp.text()
      console.log('[Spedy] upload certificado', { url, status: resp.status, ok: resp.ok, bodyPreview: bodyText.slice(0, 300) })
      if (!resp.ok) {
        let msg: string | undefined
        try {
          msg = (JSON.parse(bodyText) as Record<string, unknown>)?.message as string | undefined
        } catch {
          // resposta não-JSON — bodyText cru segue em detalhes
        }
        return {
          sucesso: false,
          status: resp.status,
          erro: msg ?? `Spedy retornou HTTP ${resp.status} ao subir o certificado.`,
          detalhes: bodyText.slice(0, 500),
        }
      }
      return { sucesso: true, status: resp.status }
    } catch (err) {
      return { sucesso: false, status: 0, erro: err instanceof Error ? err.message : String(err) }
    }
  }
}
