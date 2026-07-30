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
 * pipeline (ResultadoEmissao). Um webhook para atualização tardia fica como
 * follow-up caso o polling estoure o timeout da function.
 */
import { createHash } from 'node:crypto'
import { decrypt, isEncrypted } from '../encrypt'
import type {
  ConfigFiscalCliente,
  EmitirConsumidorInput,
  EmitirNfseInput,
  EmitirProdutoInput,
  ItemProdutoFiscal,
  Prestador,
  ResultadoEmissao,
  Tomador,
} from '../types'

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

function buildServiceInvoicePayload(input: EmitirNfseInput, config: ConfigFiscalCliente, prestador: Prestador) {
  const aliquota = input.servico.aliquota ?? config.aliquotaPadrao ?? 0
  const valor = input.servico.valorServico
  const issAmount = Number((valor * (aliquota / 100)).toFixed(2))
  const endereco = input.tomador.endereco

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
async function emitirDocumento(config: ConfigFiscalCliente, resource: string, payload: unknown): Promise<ResultadoEmissao> {
  try {
    const criacao = await obterOuCriarNota(config, resource, payload as { integrationId?: string } & Record<string, unknown>)
    if ('erro' in criacao) return criacao.erro
    const id = criacao.id
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

      const final = await pollAteTerminal(config, id)
      if (!final) {
        // Não estourou erro — a nota segue "enqueued"/"created" na Spedy além do
        // tempo de polling. Fica como pendente; precisa de um webhook ou consulta
        // manual depois (follow-up: implementar webhook `invoice.status_changed`).
        return {
          sucesso: false,
          codigoErro: 'SPEDY_PROCESSANDO',
          erro: 'A Spedy ainda está processando a nota. Consulte novamente em instantes pelo histórico.',
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
      return {
        sucesso: true,
        numeroNfse: (final.body?.number as string | number | undefined)?.toString(),
        // A Spedy não expõe um "código de verificação" separado no schema
        // atual — usamos o protocolo de autorização como referência mais
        // próxima. Vale confirmar contra uma emissão real de sandbox.
        codigoVerificacao: (autorizacao?.protocol as string | undefined) ?? undefined,
      }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
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
