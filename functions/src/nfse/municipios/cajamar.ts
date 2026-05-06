/**
 * Conector Cajamar — GeisWeb (SOAP NuSOAP proprietário)
 * Portal: https://geisweb.com.br/cajamar/nfse/php/login.php
 * WSDL:   https://geisweb.com.br/cajamar/webservice/GeisWebServiceImpl.php?wsdl
 * Método: EnviaLoteRPS
 */
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
import { lerCredencial } from './credenciais'

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

function tag(name: string, value?: string | number | null): string {
  return `<${name}>${escapeXml(value == null ? '' : String(value))}</${name}>`
}

function dataGeis(date = new Date()): string {
  return date.toISOString().split('T')[0]
}

function buildLoteGeisWebXml(params: {
  usuario: string
  senha: string
  input: EmitirNfseInput
  prestador: Prestador
  numero: string
  numeroLote: string
}) {
  const { usuario, senha, input, prestador, numero, numeroLote } = params
  const valor = input.servico.valorServico
  const deducoes = input.servico.valorDeducoes ?? 0
  const baseCalculo = Math.max(valor - deducoes, 0)
  const tomador = input.tomador
  const endereco = tomador.endereco

  return `<?xml version="1.0" encoding="UTF-8"?>
<EnviaLoteRPS>
  ${tag('Usuario', usuario)}
  ${tag('Senha', senha)}
  ${tag('NumeroLote', numeroLote)}
  <Rps>
    <ItensLote>
      ${tag('NumeroRps', Number(numero.replace(/\D/g, '').slice(-9)) || Date.now() % 1000000000)}
      ${tag('Serie', input.serieRps ?? 'RPS')}
      ${tag('Tipo', '1')}
      ${tag('TipoLcmto', input.servico.issRetido ? 'R' : 'N')}
      ${tag('CodServ', Number(input.servico.codigoServico.replace(/\D/g, '')) || input.servico.codigoServico)}
      ${tag('DtEmissao', dataGeis())}
      ${tag('Valor', valor.toFixed(2))}
      ${tag('BaseCalc', baseCalculo.toFixed(2))}
      <Tomador>
        ${tag('CNPJ', tomador.cpfCnpj.replace(/\D/g, ''))}
        ${tag('InscricaoMunicipal', '')}
        ${tag('RazaoSocial', tomador.razaoSocial)}
        <Endereco>
          ${tag('Rua', endereco?.logradouro ?? '')}
          ${tag('Numero', endereco?.numero ?? '')}
          ${tag('Bairro', endereco?.bairro ?? '')}
          ${tag('Cidade', endereco?.municipioIbge ?? '')}
          ${tag('Estado', endereco?.uf ?? '')}
          ${tag('Cep', endereco?.cep?.replace(/\D/g, '') ?? '')}
        </Endereco>
        <Contato>
          ${tag('Telefone', '')}
          ${tag('Email', tomador.email ?? '')}
        </Contato>
      </Tomador>
      ${tag('Municipio', prestador.municipioIbge)}
      ${tag('DtLanc', dataGeis())}
      ${tag('Descricao', input.servico.discriminacao)}
      ${tag('OutrosImp', '0.00')}
    </ItensLote>
  </Rps>
</EnviaLoteRPS>`
}

function textoErroGeisWeb(mensagem: string, erro?: string): string {
  const campos = [
    extractTag(mensagem, 'Mensagem'),
    extractTag(mensagem, 'MensagemRetorno'),
    extractTag(mensagem, 'Descricao'),
    extractTag(mensagem, 'Descrição'),
    extractTag(mensagem, 'Motivo'),
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
      const usuario = lerCredencial(config.credenciais?.usuario, 'Usuário GeisWeb/Cajamar')
      const senha = lerCredencial(config.credenciais?.senha, 'Senha GeisWeb/Cajamar')
      if (!usuario.valor || !senha.valor) {
        const erroCredencial = usuario.erro ?? senha.erro
        if (erroCredencial) return { sucesso: false, codigoErro: usuario.codigoErro ?? senha.codigoErro, erro: erroCredencial }
        return {
          sucesso: false,
          codigoErro: 'GEISWEB_CREDENCIAL_AUSENTE',
          erro: 'Usuário e senha GeisWeb/Cajamar não configurados. Cajamar exige credenciais do portal além do certificado.',
        }
      }

      const numero = input.numeroRps ?? String(Date.now())
      const serie = input.serieRps ?? 'RPS'
      const numeroLote = String(Date.now())
      const xmlLote = buildLoteGeisWebXml({
        usuario: usuario.valor,
        senha: senha.valor,
        input,
        prestador,
        numero,
        numeroLote,
      })

      console.log('[Cajamar/GeisWeb] emitindo NFS-e', {
        ambiente: config.ambienteEmissao,
        endpoint: GEISWEB_ENDPOINT,
        metodo: 'EnviaLoteRPS',
        usuarioCriptografado: usuario.criptografada,
        senhaCriptografada: senha.criptografada,
        prestadorCnpjFinal: prestador.cnpj.replace(/\D/g, '').slice(-4),
        numeroRps: numero,
        serieRps: serie,
      })

      const respXml = await soapCall(
        {
          endpoint: GEISWEB_ENDPOINT,
          action: `${GEISWEB_NS}#EnviaLoteRPS`,
        },
        buildRpcEnvelope(xmlLote),
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
        const textoErro = textoErroGeisWeb(mensagem, erro)
        console.warn('[Cajamar/GeisWeb] retorno com erro', {
          codigoErro,
          erro: textoErro,
          retorno: mensagem.slice(0, 1500),
        })
        return { sucesso: false, erro: textoErro, codigoErro, detalhes: mensagem }
      }

      if (!numeroNfse && /usu[aá]rio n[aã]o liberado/i.test(mensagem)) {
        return { sucesso: false, codigoErro: 'GEISWEB_USUARIO_NAO_LIBERADO', erro: mensagem, detalhes: mensagem }
      }

      return {
        sucesso: Boolean(numeroNfse),
        numeroNfse,
        codigoVerificacao,
        xmlNfse: mensagem,
        erro: numeroNfse ? undefined : textoErroGeisWeb(mensagem),
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
