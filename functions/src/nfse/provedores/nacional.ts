/**
 * NacionalConector — emissão, consulta e cancelamento de NFS-e direto na API
 * pública do governo (Sefin Nacional + ADN), SEM integrador, autenticando com o
 * certificado A1 do próprio prestador (mTLS) e assinando a DPS com ele.
 *
 * Ambiente: config.ambienteEmissao
 *   'homologacao' → produção restrita (tpAmb = 2), SÓ hosts *.producaorestrita.nfse.gov.br;
 *   'producao'    → produção (tpAmb = 1), SÓ sefin.nfse.gov.br / adn.nfse.gov.br.
 * A trava de host e de tpAmb está em nacional/ambiente.ts e é aplicada em TODA
 * requisição e em TODO XML antes do envio. A liberação de produção
 * (producaoLiberada) é conferida antes, em emitir.ts/ciclo.ts.
 *
 * Sem firebase-admin aqui: o conector roda isolado (ver
 * scripts/poc-nfse-nacional/emitir-conector.mjs) para validar ponta a ponta
 * antes do deploy.
 */
import https from 'node:https'

import { extrairChaveDoPfx, assinarXml, validarCertificado, type ChaveAssinatura } from '../xml/signer'
import type {
  CancelarNfseInput, CertificadoA1, ConfigFiscalCliente, ConsultarNfseInput,
  EmitirNfseInput, Prestador, ResultadoEmissao, ResultadoOperacaoNfse,
} from '../types'
import { normalizarIbge } from '../types'
import {
  BASES_POR_AMBIENTE, assertXmlDoAmbiente, compactarXml, descompactarXml, ehAmbienteNacional,
  extrairMensagens, montarUrlDoAmbiente, type AmbienteNacional,
} from '../nacional/ambiente'
import {
  formatarDhEmi, instanteSeguroParaEmissao, montarDpsXml, montarIdDps, montarPedidoCancelamentoXml,
} from '../nacional/dps'
import { ErroMapeamentoNacional, montarDadosNotaNacional, nomeMunicipio } from '../nacional/mapeamento'
import {
  explicarStatusHttp, mensagemMunicipioSemConvenio, mensagemMunicipioSemEmissorNacional, traduzirErrosSefin,
} from '../nacional/erros'
import { numeroDpsValido, serieDpsValida } from '../nacional/numeracao'

// ─── Transporte HTTP (injetável nos testes) ─────────────────────────────────

export interface RespostaHttp {
  status: number
  corpo: Buffer
}

export interface RequisicaoHttp {
  url: URL
  metodo: 'GET' | 'POST' | 'HEAD'
  corpoJson?: unknown
}

export type Requisitar = (req: RequisicaoHttp) => Promise<RespostaHttp>

/** Cria o cliente HTTP autenticado (mTLS) com a chave/cadeia do A1. */
export type FabricaTransporte = (chave: ChaveAssinatura) => Requisitar

const TIMEOUT_MS = 45_000

/**
 * mTLS com chave + cadeia em PEM (e não `pfx`/`passphrase` direto no Agent):
 * .pfx ICP-Brasil antigos usam cifras legadas (RC2/3DES) que o OpenSSL 3 do
 * Node recusa no option `pfx` — lição do PoC de 05/11/2026.
 */
export const transporteMtls: FabricaTransporte = (chave) => {
  const agente = new https.Agent({ key: chave.privateKeyPem, cert: chave.certChainPem, keepAlive: false })
  return ({ url, metodo, corpoJson }) => {
    const corpo = corpoJson === undefined ? undefined : Buffer.from(JSON.stringify(corpoJson), 'utf8')
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'jp-fiscal-nfse-nacional/1.0' }
    if (corpo) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = String(corpo.length)
    }
    return new Promise((resolve, reject) => {
      const req = https.request(url, { method: metodo, headers, agent: agente, timeout: TIMEOUT_MS }, (res) => {
        const partes: Buffer[] = []
        res.on('data', (c: Buffer) => partes.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes) }))
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error(`tempo esgotado (${TIMEOUT_MS / 1000} s)`)))
      req.on('error', reject)
      if (corpo) req.write(corpo)
      req.end()
    })
  }
}

function lerJson(resp: RespostaHttp): Record<string, unknown> | null {
  try {
    const v = JSON.parse(resp.corpo.toString('utf8'))
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function texto(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** xml-crypto/xmldom reserializam sem a declaração; sem ela a Sefin dá E1229. */
function comDeclaracao(xml: string): string {
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`
}

const PADRAO_CHAVE = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/

export function chaveAcessoValida(v: unknown): v is string {
  return typeof v === 'string' && PADRAO_CHAVE.test(v)
}

/** nNFSe e chave (Id "NFS" + 50) de dentro do XML da NFS-e. */
export function lerDadosNfseXml(xml: string): { numeroNfse?: string; chaveAcesso?: string; dataEmissao?: string } {
  const numeroNfse = xml.match(/<nNFSe>\s*([^<]+?)\s*<\/nNFSe>/)?.[1]
  const chaveAcesso = xml.match(/<infNFSe[^>]*\sId="NFS([0-9A-Z]{50})"/)?.[1]
  const dataEmissao = xml.match(/<dhProc>\s*([^<]+?)\s*<\/dhProc>/)?.[1]
  return { numeroNfse, chaveAcesso, dataEmissao }
}

// ─── Conector ───────────────────────────────────────────────────────────────

export interface OpcoesNacionalConector {
  transporte?: FabricaTransporte
  agora?: () => Date
  /** Pula a consulta prévia do convênio no ADN (só testes). */
  semConsultaConvenio?: boolean
}

type Falha = { sucesso: false; erro: string; codigoErro: string; detalhes?: string }

function falha(codigoErro: string, erro: string, detalhes?: string): Falha {
  return { sucesso: false, codigoErro, erro, ...(detalhes ? { detalhes } : {}) }
}

interface Sessao {
  ambiente: AmbienteNacional
  chave: ChaveAssinatura
  requisitar: Requisitar
}

export class NacionalConector {
  private readonly fabrica: FabricaTransporte
  private readonly agora: () => Date
  private readonly semConsultaConvenio: boolean

  constructor(opcoes: OpcoesNacionalConector = {}) {
    this.fabrica = opcoes.transporte ?? transporteMtls
    this.agora = opcoes.agora ?? (() => new Date())
    this.semConsultaConvenio = opcoes.semConsultaConvenio === true
  }

  /** Ambiente + certificado prontos, ou a falha já em pt-BR. */
  private abrirSessao(config: ConfigFiscalCliente, cert: CertificadoA1 | undefined): Sessao | Falha {
    if (!ehAmbienteNacional(config.ambienteEmissao)) {
      return falha('AMBIENTE_INVALIDO', 'Ambiente fiscal inválido: use "homologacao" ou "producao".')
    }
    if (!cert?.pfxBase64) {
      return falha('CERTIFICADO_AUSENTE', 'Certificado A1 não encontrado. O Ambiente Nacional exige o A1 do próprio cliente — faça o upload na configuração fiscal.')
    }
    let chave: ChaveAssinatura
    try {
      const info = validarCertificado(cert.pfxBase64, cert.senha)
      if (!info.valido) {
        return falha('CERTIFICADO_VENCIDO', `Certificado A1 vencido em ${info.vencimento.toLocaleDateString('pt-BR')}. Envie um certificado válido.`)
      }
      chave = extrairChaveDoPfx(cert.pfxBase64, cert.senha)
    } catch {
      return falha('CERTIFICADO_INVALIDO', 'Não foi possível abrir o certificado A1 (senha errada ou arquivo inválido). Reenvie o certificado.')
    }
    return { ambiente: config.ambienteEmissao, chave, requisitar: this.fabrica(chave) }
  }

  private url(ambiente: AmbienteNacional, servico: 'sefin' | 'adn', ...segmentos: string[]): URL {
    return montarUrlDoAmbiente(ambiente, BASES_POR_AMBIENTE[ambiente][servico], ...segmentos)
  }

  /**
   * ADN /parametrizacao/{ibge}/convenio. Devolve a falha se o município
   * comprovadamente não emite pelo nacional; null se pode seguir (inclusive
   * quando a consulta não foi conclusiva — aí a própria Sefin decide e o E0037
   * é traduzido do mesmo jeito).
   */
  private async conferirConvenio(sessao: Sessao, ibge: string, municipio: string): Promise<Falha | null> {
    if (this.semConsultaConvenio) return null
    let resp: RespostaHttp
    try {
      resp = await sessao.requisitar({ url: this.url(sessao.ambiente, 'adn', 'parametrizacao', ibge, 'convenio'), metodo: 'GET' })
    } catch {
      return null
    }
    const json = lerJson(resp)
    if (resp.status === 404 && json) {
      return falha('MUNICIPIO_SEM_CONVENIO', mensagemMunicipioSemConvenio(municipio), texto(json.mensagem))
    }
    if (resp.status !== 200 || !json) return null
    const p = (json.parametrosConvenio ?? null) as Record<string, unknown> | null
    if (!p) return falha('MUNICIPIO_SEM_CONVENIO', mensagemMunicipioSemConvenio(municipio), texto(json.mensagem))
    if (Number(p.aderenteAmbienteNacional) !== 1) {
      return falha('MUNICIPIO_SEM_CONVENIO', mensagemMunicipioSemConvenio(municipio), texto(json.mensagem))
    }
    if (Number(p.aderenteEmissorNacional) !== 1) {
      return falha('MUNICIPIO_SEM_EMISSOR_NACIONAL', mensagemMunicipioSemEmissorNacional(municipio), texto(json.mensagem))
    }
    return null
  }

  // ─── Emissão ──────────────────────────────────────────────────────────────

  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    const sessao = this.abrirSessao(config, cert)
    if ('sucesso' in sessao) return sessao
    const ibge = normalizarIbge(prestador.municipioIbge)
    const municipio = nomeMunicipio(ibge, config)
    const ctxErro = { municipio }

    if (!serieDpsValida(input.serieRps) || !numeroDpsValido(input.numeroRps)) {
      return falha('DPS_SEM_NUMERO', 'Número/série da DPS não alocados. Erro interno da plataforma — tente de novo.')
    }

    // Monta e assina ANTES de qualquer rede: erro de dado não gasta chamada.
    const dhEmi = formatarDhEmi(instanteSeguroParaEmissao(this.agora()))
    let xmlAssinado: string
    let idDps: string
    try {
      const dados = montarDadosNotaNacional(input, config, { ...prestador, municipioIbge: ibge }, {
        serie: input.serieRps,
        numero: input.numeroRps,
        competencia: dhEmi.slice(0, 10),
      })
      const { xml, id } = montarDpsXml(dados, { dhEmi, ambiente: sessao.ambiente })
      assertXmlDoAmbiente(xml, sessao.ambiente)
      xmlAssinado = comDeclaracao(assinarXml(xml, id, sessao.chave, { posicao: 'after' }))
      assertXmlDoAmbiente(xmlAssinado, sessao.ambiente)
      idDps = id
    } catch (err) {
      if (err instanceof ErroMapeamentoNacional) return falha(err.codigoErro, err.message)
      const msg = err instanceof Error ? err.message : String(err)
      return falha('DPS_INVALIDA', `Dados da nota não passam nas regras do leiaute nacional: ${msg}`)
    }

    const semConvenio = await this.conferirConvenio(sessao, ibge, municipio)
    if (semConvenio) return semConvenio

    let resp: RespostaHttp
    try {
      resp = await sessao.requisitar({
        url: this.url(sessao.ambiente, 'sefin', 'nfse'),
        metodo: 'POST',
        corpoJson: { dpsXmlGZipB64: compactarXml(xmlAssinado) },
      })
    } catch (err) {
      // Pode ter chegado e gerado a nota: o retry consulta /dps/{id} antes de reenviar.
      return {
        ...falha('SEFIN_SEM_RESPOSTA', 'Sem resposta da Sefin Nacional. A nota pode ter sido gerada: use "Tentar de novo" — a plataforma consulta a DPS antes de reenviar.', err instanceof Error ? err.message : String(err)),
        idDps,
      }
    }
    return { ...this.lerRespostaEmissao(resp, ctxErro), idDps }
  }

  private lerRespostaEmissao(resp: RespostaHttp, ctxErro: { municipio: string }): ResultadoEmissao {
    const json = lerJson(resp)
    if (!json) {
      return falha(`HTTP_${resp.status}`, `Resposta inesperada da Sefin Nacional — ${explicarStatusHttp(resp.status)}`, resp.corpo.toString('utf8').slice(0, 500))
    }
    const b64 = texto(json.nfseXmlGZipB64)
    if (b64) {
      let xmlNfse: string
      try {
        xmlNfse = descompactarXml(b64)
      } catch {
        return falha('NFSE_ILEGIVEL', 'A Sefin gerou a NFS-e mas o XML devolvido não pôde ser lido. Consulte a nota antes de tentar de novo.')
      }
      const doXml = lerDadosNfseXml(xmlNfse)
      const chaveAcesso = texto(json.chaveAcesso) ?? doXml.chaveAcesso
      return {
        sucesso: true,
        numeroNfse: doXml.numeroNfse,
        codigoVerificacao: chaveAcesso,
        chaveAcesso,
        xmlNfse,
      }
    }
    const { erros } = extrairMensagens(json)
    if (erros.length) {
      const t = traduzirErrosSefin(erros, ctxErro)
      return falha(t.codigoErro, t.erro, t.detalhes)
    }
    return falha(`HTTP_${resp.status}`, `A Sefin não devolveu a NFS-e nem o motivo — ${explicarStatusHttp(resp.status)}`, JSON.stringify(json).slice(0, 500))
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────

  async consultar(
    input: ConsultarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    const sessao = this.abrirSessao(config, cert)
    if ('sucesso' in sessao) return sessao
    const ctxErro = { municipio: nomeMunicipio(prestador.municipioIbge, config) }

    const chave = String(input.codigoVerificacao ?? '').trim().toUpperCase()
    if (chaveAcessoValida(chave)) return this.consultarPorChave(sessao, chave, ctxErro)

    // Sem chave: consulta pela DPS (pré-retry). RPS municipal antigo (série
    // "RPS") não existe no nacional — nada a consultar, o retry segue.
    if (!serieDpsValida(input.serieRps) || !numeroDpsValido(input.numeroRps)) {
      return { sucesso: true, mensagem: 'Sem DPS nacional para consultar (número anterior era de RPS municipal).' }
    }
    let idDps: string
    try {
      idDps = montarIdDps({
        municipioIbge: normalizarIbge(prestador.municipioIbge),
        cpfCnpj: prestador.cnpj,
        serie: input.serieRps,
        numero: input.numeroRps,
      })
    } catch (err) {
      return falha('DPS_INVALIDA', err instanceof Error ? err.message : String(err))
    }
    let resp: RespostaHttp
    try {
      // PREMISSA: o {id} vai com o prefixo "DPS" (é o idDPS que a própria Sefin devolve).
      resp = await sessao.requisitar({ url: this.url(sessao.ambiente, 'sefin', 'dps', idDps), metodo: 'GET' })
    } catch (err) {
      return falha('SEFIN_SEM_RESPOSTA', 'Sem resposta da Sefin Nacional ao consultar a DPS. Tente de novo em alguns minutos.', err instanceof Error ? err.message : String(err))
    }
    if (resp.status === 404) {
      return { sucesso: true, mensagem: `Nenhuma NFS-e gerada no Ambiente Nacional para a DPS ${idDps}.` }
    }
    const json = lerJson(resp)
    const chaveDps = texto(json?.chaveAcesso)
    if (resp.status === 200 && chaveAcessoValida(chaveDps)) {
      const porChave = await this.consultarPorChave(sessao, chaveDps, ctxErro)
      if (porChave.sucesso) return porChave
      return { sucesso: true, status: 'emitida', chaveAcesso: chaveDps, codigoVerificacao: chaveDps, mensagem: `NFS-e já gerada para a DPS ${idDps} (chave ${chaveDps}).` }
    }
    const erros = json ? extrairMensagens(json).erros : []
    if (erros.length) {
      const t = traduzirErrosSefin(erros, ctxErro)
      return falha(t.codigoErro, t.erro, t.detalhes)
    }
    return falha(`HTTP_${resp.status}`, `Não foi possível confirmar a DPS na Sefin — ${explicarStatusHttp(resp.status)}`)
  }

  private async consultarPorChave(sessao: Sessao, chave: string, ctxErro: { municipio: string }): Promise<ResultadoOperacaoNfse> {
    let resp: RespostaHttp
    try {
      resp = await sessao.requisitar({ url: this.url(sessao.ambiente, 'sefin', 'nfse', chave), metodo: 'GET' })
    } catch (err) {
      return falha('SEFIN_SEM_RESPOSTA', 'Sem resposta da Sefin Nacional ao consultar a NFS-e.', err instanceof Error ? err.message : String(err))
    }
    if (resp.status === 404) return falha('NFSE_NAO_ENCONTRADA', `NFS-e ${chave} não encontrada no Ambiente Nacional.`)
    const json = lerJson(resp)
    const b64 = texto(json?.nfseXmlGZipB64)
    if (resp.status === 200 && b64) {
      let xmlNfse: string
      try {
        xmlNfse = descompactarXml(b64)
      } catch {
        return falha('NFSE_ILEGIVEL', 'XML da NFS-e devolvido pela Sefin não pôde ser lido.')
      }
      const doXml = lerDadosNfseXml(xmlNfse)
      // PREMISSA: o cancelamento aparece como evento (consulta própria); aqui
      // a nota existir = 'emitida'. O status 'cancelada' vem do cancelar().
      return {
        sucesso: true,
        status: 'emitida',
        numeroNfse: doXml.numeroNfse,
        codigoVerificacao: chave,
        chaveAcesso: chave,
        xmlNfse,
        mensagem: 'NFS-e localizada no Ambiente Nacional.',
      }
    }
    const erros = json ? extrairMensagens(json).erros : []
    if (erros.length) {
      const t = traduzirErrosSefin(erros, ctxErro)
      return falha(t.codigoErro, t.erro, t.detalhes)
    }
    return falha(`HTTP_${resp.status}`, `Consulta da NFS-e falhou — ${explicarStatusHttp(resp.status)}`)
  }

  // ─── Cancelamento (evento e101101) ────────────────────────────────────────

  async cancelar(
    input: CancelarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    const chave = String(input.codigoVerificacao ?? '').trim().toUpperCase()
    if (!chaveAcessoValida(chave)) {
      return falha('CHAVE_AUSENTE', 'Esta nota não tem a chave de acesso do Ambiente Nacional (50 posições) — não é possível cancelar por aqui.')
    }
    const motivo = String(input.motivo ?? '').trim()
    if (motivo.length < 15 || motivo.length > 255) {
      return falha('MOTIVO_INVALIDO', 'O Ambiente Nacional exige motivo de cancelamento com 15 a 255 caracteres.')
    }
    const sessao = this.abrirSessao(config, cert)
    if ('sucesso' in sessao) return sessao
    const ctxErro = { municipio: nomeMunicipio(prestador.municipioIbge, config) }

    let xmlAssinado: string
    try {
      const { xml, id } = montarPedidoCancelamentoXml(
        // cMotivo 9 = "Outros" — o texto do usuário vai em xMotivo. PREMISSA.
        { chaveAcesso: chave, autorCpfCnpj: prestador.cnpj, codigoMotivo: 9, motivo },
        { dhEvento: formatarDhEmi(instanteSeguroParaEmissao(this.agora())), ambiente: sessao.ambiente },
      )
      assertXmlDoAmbiente(xml, sessao.ambiente)
      xmlAssinado = comDeclaracao(assinarXml(xml, id, sessao.chave, { posicao: 'after' }))
      assertXmlDoAmbiente(xmlAssinado, sessao.ambiente)
    } catch (err) {
      return falha('EVENTO_INVALIDO', `Pedido de cancelamento inválido: ${err instanceof Error ? err.message : String(err)}`)
    }

    let resp: RespostaHttp
    try {
      resp = await sessao.requisitar({
        url: this.url(sessao.ambiente, 'sefin', 'nfse', chave, 'eventos'),
        metodo: 'POST',
        corpoJson: { pedidoRegistroEventoXmlGZipB64: compactarXml(xmlAssinado) },
      })
    } catch (err) {
      return falha('SEFIN_SEM_RESPOSTA', 'Sem resposta da Sefin Nacional ao cancelar. Consulte a nota antes de tentar de novo.', err instanceof Error ? err.message : String(err))
    }
    const json = lerJson(resp)
    if (!json) return falha(`HTTP_${resp.status}`, `Resposta inesperada da Sefin Nacional — ${explicarStatusHttp(resp.status)}`)
    if (texto(json.eventoXmlGZipB64)) {
      return { sucesso: true, status: 'cancelada', codigoVerificacao: chave, chaveAcesso: chave, mensagem: 'Cancelamento registrado no Ambiente Nacional.' }
    }
    const { erros } = extrairMensagens(json)
    if (erros.length) {
      const t = traduzirErrosSefin(erros, ctxErro)
      return falha(t.codigoErro, t.erro, t.detalhes)
    }
    return falha(`HTTP_${resp.status}`, `Cancelamento sem confirmação da Sefin — ${explicarStatusHttp(resp.status)}`)
  }
}
