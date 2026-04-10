/**
 * Conector base para municípios que seguem o padrão ABRASF 2.x.
 * Subclasses sobrescrevem apenas endpoint, versão e quirks específicos.
 */
import { buildInfRpsXml, buildLoteRpsXml } from '../xml/builder'
import { assinarXml, extrairChaveDoPfx } from '../xml/signer'
import { soapCall, buildSoapEnvelope, extractSoapBody, extractTag, checkSoapFault } from '../xml/soap'
import {
  CertificadoA1, ConfigFiscalCliente, EmitirNfseInput,
  Prestador, ResultadoEmissao,
} from '../types'

export interface AbrasfConfig {
  /** URL do WebService SOAP */
  endpoint: string
  /** Versão do schema (ex: "2.04", "2.03") */
  versao?: string
  /** Namespace XML padrão do município */
  xmlns?: string
  /** SOAPAction para EnviarLoteRps */
  soapAction?: string
}

export abstract class AbrasfConector {
  protected abstract getConfig(homologacao: boolean): AbrasfConfig

  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const isHom = config.ambienteEmissao === 'homologacao'
      const cfg   = this.getConfig(isHom)
      const chave = extrairChaveDoPfx(cert.pfxBase64, cert.senha)

      const numero     = input.numeroRps    ?? String(Date.now())
      const serie      = input.serieRps     ?? 'RPS'
      const numeroLote = String(Date.now())
      const infRpsId   = `rps${numero}`
      const infLoteId  = `lote${numeroLote}`

      // 1. Constrói InfRps
      const infRpsXml = buildInfRpsXml({
        numero,
        serie,
        naturezaOperacao: config.naturezaOperacao ?? '1',
        optanteSimples:   config.optanteSimples,
        incentivadorCultural: config.incentivadorCultural,
        prestador,
        tomador:  input.tomador,
        servico:  {
          ...input.servico,
          itemListaServico: input.servico.itemListaServico ?? config.itemListaServico ?? input.servico.codigoServico,
          cnae:             input.servico.cnae              ?? config.cnae,
          aliquota:         input.servico.aliquota          ?? config.aliquotaPadrao,
          municipioPrestacao: prestador.municipioIbge,
        },
        regimeTributario: config.regimeTributario,
        infRpsId,
      })

      // 2. Assina o InfRps
      const xmlComInfRps    = `<Rps>${infRpsXml}</Rps>`
      const xmlInfRpsAssinado = assinarXml(xmlComInfRps, infRpsId, chave)

      // 3. Constrói InfLoteRps
      const infLoteXml = buildLoteRpsXml({
        numeroLote,
        cnpjPrestador:       prestador.cnpj,
        inscricaoMunicipal:  prestador.inscricaoMunicipal,
        rpsListXml:          xmlInfRpsAssinado,
        quantidadeRps:       1,
        infLoteId,
      })

      // 4. Assina o lote
      const xmlLoteWrapper   = `<EnviarLoteRpsEnvio>${infLoteXml}</EnviarLoteRpsEnvio>`
      const xmlLoteAssinado  = assinarXml(xmlLoteWrapper, infLoteId, chave)

      // 5. Monta envelope SOAP
      const xmlns = cfg.xmlns ?? 'http://www.abrasf.org.br/nfse.xsd'
      const soapBody = buildSoapEnvelope(
        xmlLoteAssinado,
        { nfse: xmlns }
      )

      // 6. Envia
      const respXml   = await soapCall({ endpoint: cfg.endpoint, action: cfg.soapAction }, soapBody)
      const bodyXml   = extractSoapBody(respXml)

      // 7. Verifica erro
      const fault = checkSoapFault(bodyXml)
      if (fault) return { sucesso: false, erro: fault }

      const msgErro = extractTag(bodyXml, 'Mensagem') ?? extractTag(bodyXml, 'MensagemRetorno')
      const codErro = extractTag(bodyXml, 'Codigo')
      if (msgErro && codErro !== '100') {
        return { sucesso: false, erro: msgErro, codigoErro: codErro, detalhes: bodyXml }
      }

      // 8. Extrai resultado
      const numeroNfse   = extractTag(bodyXml, 'Numero')
      const codVerif     = extractTag(bodyXml, 'CodigoVerificacao')
      const xmlNfse      = extractTag(bodyXml, 'NfseXml') ?? bodyXml

      return {
        sucesso:           true,
        numeroNfse:        numeroNfse,
        codigoVerificacao: codVerif,
        xmlNfse,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { sucesso: false, erro: msg }
    }
  }
}
