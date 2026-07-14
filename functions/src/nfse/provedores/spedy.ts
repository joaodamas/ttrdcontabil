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

function buildServiceInvoicePayload(input: EmitirNfseInput, config: ConfigFiscalCliente, prestador: Prestador) {
  const aliquota = input.servico.aliquota ?? config.aliquotaPadrao ?? 0
  const valor = input.servico.valorServico
  const issAmount = Number((valor * (aliquota / 100)).toFixed(2))
  const endereco = input.tomador.endereco

  return {
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

async function pollAteTerminal(config: ConfigFiscalCliente, id: string, resource = 'service-invoices'): Promise<SpedyResposta | null> {
  for (let tentativa = 0; tentativa < POLL_MAX_TENTATIVAS; tentativa++) {
    const resultado = await spedyFetch(config, `/${resource}/${id}`, { method: 'GET' })
    if (!resultado.resp.ok) return resultado
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
    const criacao = await spedyFetch(config, `/${resource}`, { method: 'POST', body: JSON.stringify(payload) })
    if (!criacao.resp.ok) {
      return {
        sucesso: false,
        codigoErro: `SPEDY_HTTP_${criacao.resp.status}`,
        erro: (criacao.body?.message as string | undefined) ?? `Spedy retornou HTTP ${criacao.resp.status}.`,
        detalhes: criacao.bodyText.slice(0, 1000),
      }
    }
    const id = criacao.body?.id as string | undefined
    if (!id) {
      return { sucesso: false, erro: 'Resposta da Spedy não trouxe o identificador da nota.', detalhes: criacao.bodyText.slice(0, 1000) }
    }
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
      const criacao = await spedyFetch(config, '/service-invoices', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (!criacao.resp.ok) {
        return {
          sucesso: false,
          codigoErro: `SPEDY_HTTP_${criacao.resp.status}`,
          erro: (criacao.body?.message as string | undefined) ?? `Spedy retornou HTTP ${criacao.resp.status} ao criar a NFS-e.`,
          detalhes: criacao.bodyText.slice(0, 1000),
        }
      }

      const id = criacao.body?.id as string | undefined
      if (!id) {
        return {
          sucesso: false,
          erro: 'Resposta da Spedy não trouxe o identificador da nota.',
          detalhes: criacao.bodyText.slice(0, 1000),
        }
      }

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
