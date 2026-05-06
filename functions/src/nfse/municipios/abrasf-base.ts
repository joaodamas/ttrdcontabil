/**
 * Conector base para municípios que seguem o padrão ABRASF 2.x.
 * Subclasses sobrescrevem apenas endpoint, versão e quirks específicos.
 */
import { buildInfRpsXml, buildLoteRpsXml } from '../xml/builder'
import { assinarXml, extrairChaveDoPfx } from '../xml/signer'
import { soapCall, buildSoapEnvelope, extractSoapBody, extractTag, checkSoapFault } from '../xml/soap'
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
      const respXml   = await soapCall({
        endpoint: cfg.endpoint,
        action: cfg.soapAction,
        certPem: chave.certPem,
        keyPem: chave.privateKeyPem,
      }, soapBody)
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

  async consultar(
    input: ConsultarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    try {
      if (!cert) return { sucesso: false, codigoErro: 'CERTIFICADO_A1_AUSENTE', erro: 'Certificado A1 não encontrado.' }
      if (!input.numeroRps && !input.numeroNfse) {
        return { sucesso: false, codigoErro: 'IDENTIFICADOR_AUSENTE', erro: 'Informe número do RPS ou número da NFS-e para consulta.' }
      }

      const isHom = config.ambienteEmissao === 'homologacao'
      const cfg = this.getConfig(isHom)
      const chave = extrairChaveDoPfx(cert.pfxBase64, cert.senha)
      const xmlns = cfg.xmlns ?? 'http://www.abrasf.org.br/nfse.xsd'
      const pedidoId = `consulta${Date.now()}`

      const pedidoXml = input.numeroRps
        ? `<ConsultarNfseRpsEnvio Id="${pedidoId}" xmlns="${xmlns}">
  <IdentificacaoRps>
    <Numero>${input.numeroRps}</Numero>
    <Serie>${input.serieRps ?? 'RPS'}</Serie>
    <Tipo>1</Tipo>
  </IdentificacaoRps>
  <Prestador>
    <CpfCnpj><Cnpj>${prestador.cnpj.replace(/\D/g, '')}</Cnpj></CpfCnpj>
    <InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>
  </Prestador>
</ConsultarNfseRpsEnvio>`
        : `<ConsultarNfseServicoPrestadoEnvio Id="${pedidoId}" xmlns="${xmlns}">
  <Prestador>
    <CpfCnpj><Cnpj>${prestador.cnpj.replace(/\D/g, '')}</Cnpj></CpfCnpj>
    <InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>
  </Prestador>
  <NumeroNfse>${input.numeroNfse}</NumeroNfse>
</ConsultarNfseServicoPrestadoEnvio>`

      const pedidoAssinado = assinarXml(pedidoXml, pedidoId, chave)
      const respXml = await soapCall(
        {
          endpoint: cfg.endpoint,
          action: cfg.soapAction?.replace('RecepcionarLoteRps', 'ConsultarNfsePorRps'),
          certPem: chave.certPem,
          keyPem: chave.privateKeyPem,
        },
        buildSoapEnvelope(pedidoAssinado, { nfse: xmlns }),
      )
      const bodyXml = extractSoapBody(respXml)
      const fault = checkSoapFault(bodyXml)
      if (fault) return { sucesso: false, erro: fault, detalhes: bodyXml }

      const msgErro = extractTag(bodyXml, 'Mensagem') ?? extractTag(bodyXml, 'MensagemRetorno')
      const codErro = extractTag(bodyXml, 'Codigo')
      if (msgErro && !extractTag(bodyXml, 'Numero')) {
        return { sucesso: false, erro: msgErro, codigoErro: codErro, detalhes: bodyXml }
      }

      return {
        sucesso: true,
        status: 'emitida',
        mensagem: 'NFS-e localizada na prefeitura.',
        numeroNfse: extractTag(bodyXml, 'Numero') ?? input.numeroNfse,
        codigoVerificacao: extractTag(bodyXml, 'CodigoVerificacao') ?? input.codigoVerificacao,
        xmlNfse: bodyXml,
      }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }

  async cancelar(
    input: CancelarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    try {
      if (!cert) return { sucesso: false, codigoErro: 'CERTIFICADO_A1_AUSENTE', erro: 'Certificado A1 não encontrado.' }
      if (!input.numeroNfse) return { sucesso: false, codigoErro: 'NUMERO_NFSE_AUSENTE', erro: 'Número da NFS-e obrigatório para cancelamento.' }

      const isHom = config.ambienteEmissao === 'homologacao'
      const cfg = this.getConfig(isHom)
      const chave = extrairChaveDoPfx(cert.pfxBase64, cert.senha)
      const xmlns = cfg.xmlns ?? 'http://www.abrasf.org.br/nfse.xsd'
      const pedidoId = `cancelamento${Date.now()}`

      const pedidoXml = `<CancelarNfseEnvio Id="${pedidoId}" xmlns="${xmlns}">
  <Pedido>
    <InfPedidoCancelamento Id="inf${pedidoId}">
      <IdentificacaoNfse>
        <Numero>${input.numeroNfse}</Numero>
        <CpfCnpj><Cnpj>${prestador.cnpj.replace(/\D/g, '')}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>
        <CodigoMunicipio>${prestador.municipioIbge}</CodigoMunicipio>
      </IdentificacaoNfse>
      <CodigoCancelamento>2</CodigoCancelamento>
    </InfPedidoCancelamento>
  </Pedido>
</CancelarNfseEnvio>`

      const pedidoAssinado = assinarXml(pedidoXml, pedidoId, chave)
      const respXml = await soapCall(
        {
          endpoint: cfg.endpoint,
          action: cfg.soapAction?.replace('RecepcionarLoteRps', 'CancelarNfse'),
          certPem: chave.certPem,
          keyPem: chave.privateKeyPem,
        },
        buildSoapEnvelope(pedidoAssinado, { nfse: xmlns }),
      )
      const bodyXml = extractSoapBody(respXml)
      const fault = checkSoapFault(bodyXml)
      if (fault) return { sucesso: false, erro: fault, detalhes: bodyXml }

      const msgErro = extractTag(bodyXml, 'Mensagem') ?? extractTag(bodyXml, 'MensagemRetorno')
      const codErro = extractTag(bodyXml, 'Codigo')
      if (msgErro && !bodyXml.toLowerCase().includes('cancelamento')) {
        return { sucesso: false, erro: msgErro, codigoErro: codErro, detalhes: bodyXml }
      }

      return {
        sucesso: true,
        status: 'cancelada',
        mensagem: 'Cancelamento confirmado pela prefeitura.',
        numeroNfse: input.numeroNfse,
        codigoVerificacao: input.codigoVerificacao,
        xmlNfse: bodyXml,
      }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }
}
