/**
 * Conector Cajamar — GeisWeb (SOAP NuSOAP proprietário)
 * Portal: https://geisweb.com.br/cajamar/nfse/php/login.php
 * WSDL:   https://www.gerenciadecidades.com.br/producao/cajamar/webservice/GeisWebServiceImpl.php?wsdl
 * Método: EnviaLoteRps
 */
import { extractSoapBody, extractTag, soapCall } from '../xml/soap'
import { extrairChaveDoPfx } from '../xml/signer'
import { sanitizeAuditString } from '../../audit'
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

const GEISWEB_ENDPOINT_PROD = 'https://www.gerenciadecidades.com.br/producao/cajamar/webservice/GeisWebServiceImpl.php'
const GEISWEB_ENDPOINT_HOM = 'https://www.gerenciadecidades.com.br/homologacao/modelo/webservice/GeisWebServiceImpl.php'
const GEISWEB_NS_PROD = `urn:${GEISWEB_ENDPOINT_PROD}`
const GEISWEB_NS_HOM = `urn:${GEISWEB_ENDPOINT_HOM}`
const GEISWEB_LOTE_NS = 'http://www.gerenciadecidades.com.br/xsd/envio_lote_rps.xsd'

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

function buildRpcEnvelope(xmlLoteAssinado: string, namespace: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:EnviaLoteRps>
      <EnviaLoteRps xsi:type="xsd:string">${escapeXml(xmlLoteAssinado)}</EnviaLoteRps>
    </tns:EnviaLoteRps>
  </soapenv:Body>
</soapenv:Envelope>`
}

function extrairMensagemGeisWeb(bodyXml: string): string {
  const msg = extractTag(bodyXml, 'Msg') ?? extractTag(bodyXml, 'return') ?? bodyXml
  return unescapeXml(msg)
}

function tag(name: string, value?: string | number | null): string {
  return `<${name}>${escapeXml(value == null ? '' : String(value))}</${name}>`
}

function dataGeis(date = new Date()): string {
  return date.toISOString().split('T')[0]
}

function regimeGeis(config: ConfigFiscalCliente): string {
  if (config.regimeTributario === 'mei') return '2'
  if (config.regimeTributario === 'isento') return '4'
  if (config.optanteSimples || config.regimeTributario === 'simples_nacional') return '1'
  return '6'
}

function tipoLancamentoGeis(input: EmitirNfseInput, config: ConfigFiscalCliente): string {
  if (config.optanteSimples || config.regimeTributario === 'simples_nacional' || config.regimeTributario === 'mei') return 'P'
  if (input.servico.issRetido) return 'T'
  return 'N'
}

function numeroRpsGeis(numero: string): string {
  return String(Number(numero.replace(/\D/g, '').slice(-8)) || Date.now() % 100000000)
}

function buildLoteGeisWebXml(params: {
  input: EmitirNfseInput
  config: ConfigFiscalCliente
  prestador: Prestador
  numero: string
  numeroLote: string
}) {
  const { input, config, prestador, numero, numeroLote } = params
  const valor = input.servico.valorServico
  const deducoes = input.servico.valorDeducoes ?? 0
  const baseCalculo = Math.max(valor - deducoes, 0)
  const tomador = input.tomador
  const endereco = tomador.endereco

  return `<EnviaLoteRps xmlns="${GEISWEB_LOTE_NS}">
  ${tag('CnpjCpf', prestador.cnpj.replace(/\D/g, ''))}
  ${tag('NumeroLote', numeroLote)}
  <Rps>
    <IdentificacaoRps>
      ${tag('NumeroRps', numeroRpsGeis(numero))}
    </IdentificacaoRps>
    ${tag('DataEmissao', dataGeis())}
    <Servico>
      <Valores>
        ${tag('ValorServicos', valor.toFixed(2))}
        ${tag('BaseCalculo', baseCalculo.toFixed(2))}
        ${tag('Aliquota', (input.servico.aliquota ?? config.aliquotaPadrao ?? 0).toFixed(2))}
      </Valores>
      ${tag('CodigoServico', Number(input.servico.codigoServico.replace(/\D/g, '')) || input.servico.codigoServico)}
      ${tag('TipoLancamento', tipoLancamentoGeis(input, config))}
      ${tag('Discriminacao', input.servico.discriminacao)}
      ${tag('MunicipioPrestacaoServico', endereco?.municipioIbge ?? prestador.municipioIbge)}
    </Servico>
    <PrestadorServico>
      <IdentificacaoPrestador>
        ${tag('CnpjCpf', prestador.cnpj.replace(/\D/g, ''))}
        ${tag('InscricaoMunicipal', prestador.inscricaoMunicipal)}
        ${tag('Regime', regimeGeis(config))}
      </IdentificacaoPrestador>
    </PrestadorServico>
    <TomadorServico>
      <IdentificacaoTomador>
        ${tag('CnpjCpf', tomador.cpfCnpj.replace(/\D/g, ''))}
      </IdentificacaoTomador>
      ${tag('RazaoSocial', tomador.razaoSocial)}
      <Endereco>
        ${tag('Rua', endereco?.logradouro ?? '')}
        ${tag('Numero', endereco?.numero ?? '')}
        ${tag('Bairro', endereco?.bairro ?? '')}
        ${tag('Cidade', endereco?.municipioIbge ?? '')}
        ${tag('Estado', endereco?.uf ?? '')}
        ${tag('Cep', endereco?.cep?.replace(/\D/g, '') ?? '')}
        ${tomador.email ? tag('Email', tomador.email) : ''}
      </Endereco>
    </TomadorServico>
    <OrgaoGerador>
      ${tag('CodigoMunicipio', prestador.municipioIbge)}
      ${tag('Uf', 'SP')}
    </OrgaoGerador>
    <OutrosImpostos>
      ${tag('Pis', (input.servico.valorPis ?? 0).toFixed(2))}
      ${tag('Cofins', (input.servico.valorCofins ?? 0).toFixed(2))}
      ${tag('Csll', (input.servico.valorCsll ?? 0).toFixed(2))}
      ${tag('Irrf', (input.servico.valorIr ?? 0).toFixed(2))}
      ${tag('Inss', (input.servico.valorInss ?? 0).toFixed(2))}
    </OutrosImpostos>
  </Rps>
</EnviaLoteRps>`
}

function textoErroGeisWeb(mensagem: string, erro?: string): string {
  const campos = [
    extractTag(mensagem, 'Mensagem'),
    extractTag(mensagem, 'MensagemRetorno'),
    extractTag(mensagem, 'Descricao'),
    extractTag(mensagem, 'Descrição'),
    extractTag(mensagem, 'Motivo'),
    extractTag(mensagem, 'Status'),
    extractTag(mensagem, 'Erro'),
    extractTag(mensagem, 'Msg'),
  ].filter((valor): valor is string => Boolean(valor && valor.trim()))

  const texto = campos.find((valor) => !/^\d+$/.test(valor.trim())) ?? erro
  if (texto && !/^\d+$/.test(texto.trim())) return texto

  const compacto = mensagem.replace(/\s+/g, ' ').trim()
  if (compacto && compacto !== erro) return `GeisWeb retornou código ${erro ?? 'sem mensagem'}: ${compacto.slice(0, 1000)}`

  return `GeisWeb retornou código ${erro ?? 'sem mensagem'} sem descrição.`
}

export class CajamarConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const endpoint = config.ambienteEmissao === 'homologacao' ? GEISWEB_ENDPOINT_HOM : GEISWEB_ENDPOINT_PROD
      const namespace = config.ambienteEmissao === 'homologacao' ? GEISWEB_NS_HOM : GEISWEB_NS_PROD
      const chave = extrairChaveDoPfx(cert.pfxBase64, cert.senha)
      const numero = input.numeroRps ?? String(Date.now())
      const serie = input.serieRps ?? 'RPS'
      const numeroLote = String(Date.now()).slice(-10)
      const xmlLote = buildLoteGeisWebXml({
        input,
        config,
        prestador,
        numero,
        numeroLote,
      })

      console.log('[Cajamar/GeisWeb] emitindo NFS-e', {
        ambiente: config.ambienteEmissao,
        endpoint,
        metodo: 'EnviaLoteRps',
        prestadorCnpjFinal: prestador.cnpj.replace(/\D/g, '').slice(-4),
        numeroRps: numero,
        serieRps: serie,
      })

      const respXml = await soapCall(
        {
          endpoint,
          action: `${namespace}#EnviaLoteRps`,
          certPem: chave.certChainPem,
          keyPem: chave.privateKeyPem,
        },
        buildRpcEnvelope(xmlLote, namespace),
      )
      const bodyXml = extractSoapBody(respXml)
      const mensagem = extrairMensagemGeisWeb(bodyXml)

      const erro = extractTag(mensagem, 'Mensagem')
        ?? extractTag(mensagem, 'MensagemRetorno')
        ?? extractTag(mensagem, 'Status')
        ?? extractTag(mensagem, 'Erro')
      const codigoErro = extractTag(mensagem, 'Codigo') ?? extractTag(mensagem, 'Erro')
      const numeroNfse = extractTag(mensagem, 'Numero')
        ?? extractTag(mensagem, 'NumeroNfse')
        ?? extractTag(mensagem, 'NumeroNFSe')
        ?? extractTag(mensagem, 'NumeroNfse')
      const codigoVerificacao = extractTag(mensagem, 'CodigoVerificacao')

      if (!numeroNfse && /usu[aá]rio n[aã]o liberado/i.test(mensagem)) {
        const mensagemTecnica = textoErroGeisWeb(mensagem, 'Usuário não liberado para o uso do Web Service.')
        return {
          sucesso: false,
          codigoErro: 'GEISWEB_USUARIO_NAO_LIBERADO',
          erro: 'Usuário não liberado para o uso do Web Service.',
          detalhes: mensagemTecnica === 'Usuário não liberado para o uso do Web Service.'
            ? sanitizeAuditString(mensagem)
            : mensagemTecnica,
        }
      }

      if (erro && !numeroNfse) {
        const textoErro = textoErroGeisWeb(mensagem, erro)
        console.warn('[Cajamar/GeisWeb] retorno com erro', {
          codigoErro,
          erro: textoErro,
          retorno: sanitizeAuditString(mensagem).slice(0, 500),
        })
        return { sucesso: false, erro: textoErro, codigoErro, detalhes: sanitizeAuditString(mensagem) }
      }

      return {
        sucesso: Boolean(numeroNfse),
        numeroNfse,
        codigoVerificacao,
        xmlNfse: mensagem,
        erro: numeroNfse ? undefined : textoErroGeisWeb(mensagem),
        detalhes: numeroNfse ? undefined : sanitizeAuditString(mensagem),
      }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }

  async consultar(
    input: ConsultarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    void input
    void config
    void cert
    void prestador
    return {
      sucesso: false,
      codigoErro: 'CONSULTA_NAO_IMPLEMENTADA',
      erro: 'Consulta real ainda não implementada para Cajamar/GeisWeb.',
    }
  }

  async cancelar(
    input: CancelarNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1 | undefined,
    prestador: Prestador,
  ): Promise<ResultadoOperacaoNfse> {
    void input
    void config
    void cert
    void prestador
    return {
      sucesso: false,
      codigoErro: 'CANCELAMENTO_NAO_IMPLEMENTADO',
      erro: 'Cancelamento real ainda não implementado para Cajamar/GeisWeb.',
    }
  }
}
