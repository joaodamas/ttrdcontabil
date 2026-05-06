/**
 * Conector Cajamar — GeisWeb (SOAP NuSOAP proprietário)
 * Portal: https://geisweb.com.br/cajamar/nfse/php/login.php
 * WSDL:   https://geisweb.com.br/cajamar/webservice/GeisWebServiceImpl.php?wsdl
 * Método: EnviaLoteRPS
 */
import { buildInfRpsXml, buildLoteRpsXml } from '../xml/builder'
import { assinarXml, extrairChaveDoPfx } from '../xml/signer'
import { extractSoapBody, extractTag, soapCall } from '../xml/soap'
import {
  CancelarNfseInput,
  CertificadoA1,
  ConfigFiscalCliente,
  ConsultarNfseInput,
  EmitirNfseInput,
  Prestador,
  ResultadoEmissao,
  ResultadoOperacaoNfse,
} from '../types'

const GEISWEB_ENDPOINT = 'https://geisweb.com.br/cajamar/webservice/GeisWebServiceImpl.php'
const GEISWEB_NS = 'urn:http://www.geisweb.com.br/cajamar/webservice'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function buildRpcEnvelope(xmlLoteAssinado: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${GEISWEB_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:EnviaLoteRPS>
      <EnviaLoteRPS xsi:type="xsd:string">${escapeXml(xmlLoteAssinado)}</EnviaLoteRPS>
    </tns:EnviaLoteRPS>
  </soapenv:Body>
</soapenv:Envelope>`
}

function extrairMensagemGeisWeb(bodyXml: string): string {
  const msg = extractTag(bodyXml, 'Msg') ?? extractTag(bodyXml, 'return') ?? bodyXml
  return unescapeXml(msg)
}

export class CajamarConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const chave = extrairChaveDoPfx(cert.pfxBase64, cert.senha)
      const numero = input.numeroRps ?? String(Date.now())
      const serie = input.serieRps ?? 'RPS'
      const numeroLote = String(Date.now())
      const infRpsId = `rps${numero}`
      const infLoteId = `lote${numeroLote}`

      const infRpsXml = buildInfRpsXml({
        numero,
        serie,
        naturezaOperacao: config.naturezaOperacao ?? '1',
        optanteSimples: config.optanteSimples,
        incentivadorCultural: config.incentivadorCultural,
        prestador,
        tomador: input.tomador,
        servico: {
          ...input.servico,
          itemListaServico: input.servico.itemListaServico ?? config.itemListaServico ?? input.servico.codigoServico,
          cnae: input.servico.cnae ?? config.cnae,
          aliquota: input.servico.aliquota ?? config.aliquotaPadrao,
          municipioPrestacao: prestador.municipioIbge,
        },
        regimeTributario: config.regimeTributario,
        infRpsId,
      })

      const xmlInfRpsAssinado = assinarXml(`<Rps>${infRpsXml}</Rps>`, infRpsId, chave)
      const infLoteXml = buildLoteRpsXml({
        numeroLote,
        cnpjPrestador: prestador.cnpj,
        inscricaoMunicipal: prestador.inscricaoMunicipal,
        rpsListXml: xmlInfRpsAssinado,
        quantidadeRps: 1,
        infLoteId,
      })
      const xmlLoteAssinado = assinarXml(`<EnviarLoteRpsEnvio>${infLoteXml}</EnviarLoteRpsEnvio>`, infLoteId, chave)

      console.log('[Cajamar/GeisWeb] emitindo NFS-e', {
        ambiente: config.ambienteEmissao,
        endpoint: GEISWEB_ENDPOINT,
        metodo: 'EnviaLoteRPS',
        prestadorCnpjFinal: prestador.cnpj.replace(/\D/g, '').slice(-4),
        numeroRps: numero,
        serieRps: serie,
      })

      const respXml = await soapCall(
        {
          endpoint: GEISWEB_ENDPOINT,
          action: `${GEISWEB_NS}#EnviaLoteRPS`,
          certPem: chave.certPem,
          keyPem: chave.privateKeyPem,
        },
        buildRpcEnvelope(xmlLoteAssinado),
      )
      const bodyXml = extractSoapBody(respXml)
      const mensagem = extrairMensagemGeisWeb(bodyXml)

      const erro = extractTag(mensagem, 'Mensagem')
        ?? extractTag(mensagem, 'MensagemRetorno')
        ?? extractTag(mensagem, 'Erro')
      const codigoErro = extractTag(mensagem, 'Codigo')
      const numeroNfse = extractTag(mensagem, 'Numero')
        ?? extractTag(mensagem, 'NumeroNfse')
        ?? extractTag(mensagem, 'NumeroNFSe')
      const codigoVerificacao = extractTag(mensagem, 'CodigoVerificacao')

      if (erro && !numeroNfse) {
        return { sucesso: false, erro, codigoErro, detalhes: mensagem }
      }

      if (!numeroNfse && /usu[aá]rio n[aã]o liberado/i.test(mensagem)) {
        return { sucesso: false, codigoErro: 'GEISWEB_USUARIO_NAO_LIBERADO', erro: mensagem, detalhes: mensagem }
      }

      return {
        sucesso: Boolean(numeroNfse),
        numeroNfse,
        codigoVerificacao,
        xmlNfse: mensagem,
        erro: numeroNfse ? undefined : 'GeisWeb não retornou número da NFS-e.',
        detalhes: numeroNfse ? undefined : mensagem,
      }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }

  async consultar(
    _input: ConsultarNfseInput,
    _config: ConfigFiscalCliente,
    _cert: CertificadoA1 | undefined,
    _prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    return {
      sucesso: false,
      codigoErro: 'CONSULTA_NAO_IMPLEMENTADA',
      erro: 'Consulta real ainda não implementada para Cajamar/GeisWeb.',
    }
  }

  async cancelar(
    _input: CancelarNfseInput,
    _config: ConfigFiscalCliente,
    _cert: CertificadoA1 | undefined,
    _prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    return {
      sucesso: false,
      codigoErro: 'CANCELAMENTO_NAO_IMPLEMENTADO',
      erro: 'Cancelamento real ainda não implementado para Cajamar/GeisWeb.',
    }
  }
}
