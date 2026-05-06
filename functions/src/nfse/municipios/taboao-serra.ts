/**
 * Conector Taboão da Serra — Etransparencia/Conam (SOAP proprietário)
 * Portal: https://nfe.etransparencia.com.br/sp.taboaodaserra/nfe
 * Autenticação: código de usuário + código do contribuinte (token)
 */
import { ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'
import { buildSoapEnvelope, extractSoapBody, extractTag, soapCall } from '../xml/soap'
import { lerCredencial } from './credenciais'

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function tag(name: string, value?: string | number | null): string {
  return `<${name}>${escapeXml(value == null ? '' : String(value))}</${name}>`
}

function valorIss(valorServico: number, aliquotaPercentual: number): number {
  return Number((valorServico * (aliquotaPercentual / 100)).toFixed(2))
}

function mesReferencia(date = new Date()) {
  const ano = String(date.getFullYear())
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const primeiroDia = `${ano}-${mes}-01`
  const ultimoDia = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]
  return { ano, mes, primeiroDia, ultimoDia }
}

function buildTaboaoEnvelope(params: {
  codigoUsuario: string
  codigoContribuinte: string
  input: EmitirNfseInput
  config: ConfigFiscalCliente
  prestador: Prestador
  numero: string
}) {
  const { codigoUsuario, codigoContribuinte, input, config, prestador, numero } = params
  const ref = mesReferencia()
  const tomadorEndereco = input.tomador.endereco
  const valorServico = input.servico.valorServico
  const valorDeducoes = input.servico.valorDeducoes ?? 0
  const baseCalculo = Math.max(valorServico - valorDeducoes, 0)
  const aliquota = input.servico.aliquota ?? config.aliquotaPadrao ?? 0
  const iss = valorIss(baseCalculo, aliquota)
  const issRetido = input.servico.issRetido ? iss : 0

  const body = `<ws_nfe.PROCESSARPS xmlns="NFe">
  <Sdt_processarpsin>
    <Login>
      ${tag('CodigoUsuario', codigoUsuario)}
      ${tag('CodigoContribuinte', codigoContribuinte)}
    </Login>
    <SDTRPS>
      ${tag('Ano', ref.ano)}
      ${tag('Mes', ref.mes)}
      ${tag('CPFCNPJ', prestador.cnpj.replace(/\D/g, ''))}
      ${tag('DTIni', ref.primeiroDia)}
      ${tag('DTFin', ref.ultimoDia)}
      ${tag('TipoTrib', config.optanteSimples ? 'SN' : 'N')}
      ${tag('DtAdeSN', '')}
      ${tag('AlqIssSN_IP', config.optanteSimples ? aliquota.toFixed(2) : '')}
      ${tag('RegApTribSN', '')}
      ${tag('TribTpSusp', '')}
      ${tag('TribProcSusp', '')}
      ${tag('Versao', '1.00')}
      <Reg20>
        <Reg20Item>
          ${tag('TipoNFS', 'N')}
          ${tag('NumRps', numero)}
          ${tag('SerRps', input.serieRps ?? 'RPS')}
          ${tag('DtEmi', new Date().toISOString().split('T')[0])}
          ${tag('RetFonte', input.servico.issRetido ? 'S' : 'N')}
          ${tag('CodSrv', input.servico.codigoServico)}
          ${tag('DiscrSrv', input.servico.discriminacao)}
          ${tag('VlNFS', valorServico.toFixed(2))}
          ${tag('VlDed', valorDeducoes.toFixed(2))}
          ${tag('DiscrDed', '')}
          ${tag('VlBasCalc', baseCalculo.toFixed(2))}
          ${tag('AlqIss', aliquota.toFixed(2))}
          ${tag('VlIss', iss.toFixed(2))}
          ${tag('VlIssRet', issRetido.toFixed(2))}
          ${tag('CpfCnpTom', input.tomador.cpfCnpj.replace(/\D/g, ''))}
          ${tag('RazSocTom', input.tomador.razaoSocial)}
          ${tag('TipoLogtom', '')}
          ${tag('LogTom', tomadorEndereco?.logradouro ?? '')}
          ${tag('NumEndTom', tomadorEndereco?.numero ?? '')}
          ${tag('ComplEndTom', tomadorEndereco?.complemento ?? '')}
          ${tag('BairroTom', tomadorEndereco?.bairro ?? '')}
          ${tag('MunTom', tomadorEndereco?.municipioIbge ?? '')}
          ${tag('SiglaUFTom', tomadorEndereco?.uf ?? '')}
          ${tag('CepTom', tomadorEndereco?.cep?.replace(/\D/g, '') ?? '')}
          ${tag('Telefone', '')}
          ${tag('InscricaoMunicipal', '')}
          ${tag('TipoLogLocPre', '')}
          ${tag('LogLocPre', '')}
          ${tag('NumEndLocPre', '')}
          ${tag('ComplEndLocPre', '')}
          ${tag('BairroLocPre', '')}
          ${tag('MunLocPre', prestador.municipioIbge)}
          ${tag('SiglaUFLocpre', 'SP')}
          ${tag('CepLocPre', '')}
          ${tag('Email1', input.tomador.email ?? '')}
          ${tag('Email2', '')}
          ${tag('Email3', '')}
          ${tag('MoedaTrnExt', '')}
          ${tag('ValTrnExt', '')}
          <Reg30/>
          <Reg40/>
          <Reg50/>
          <Reg60_RTC>
            ${tag('Finalidade', '')}
            ${tag('IndConsFin', '')}
            ${tag('IndDest', '')}
            ${tag('IndOpeOne', '')}
            ${tag('IndCodOpe', '')}
            ${tag('VlReeRepRes', '')}
            <gIBSCBS>${tag('CST', '')}${tag('CClassTrib', '')}${tag('CCodCredPres', '')}</gIBSCBS>
            <gTribReg>${tag('CST', '')}${tag('CClassTrib', '')}</gTribReg>
            <gDif>${tag('PDifUF', '')}${tag('PDifMun', '')}${tag('PDifCBS', '')}</gDif>
          </Reg60_RTC>
        </Reg20Item>
      </Reg20>
      <Reg90>
        ${tag('QtdRegNormal', '1')}
        ${tag('ValorNFS', valorServico.toFixed(2))}
        ${tag('ValorISS', iss.toFixed(2))}
        ${tag('ValorDed', valorDeducoes.toFixed(2))}
        ${tag('ValorIssRetTom', issRetido.toFixed(2))}
        ${tag('QtdReg30', '0')}
        ${tag('ValorTributos', '0.00')}
        ${tag('QtdReg40', '0')}
        ${tag('QtdReg50', '0')}
      </Reg90>
    </SDTRPS>
  </Sdt_processarpsin>
</ws_nfe.PROCESSARPS>`

  return buildSoapEnvelope(body)
}

export class TaboaoSerraConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const codigoUsuario      = lerCredencial(config.credenciais?.conamCodigoUsuario, 'Código de usuário Conam')
      const codigoContribuinte = lerCredencial(config.credenciais?.conamCodigoContribuinte, 'Código de contribuinte Conam')
      if (!codigoUsuario.valor || !codigoContribuinte.valor) {
        const erroCredencial = codigoUsuario.erro ?? codigoContribuinte.erro
        if (erroCredencial) return { sucesso: false, codigoErro: codigoUsuario.codigoErro ?? codigoContribuinte.codigoErro, erro: erroCredencial }
        return { sucesso: false, erro: 'Código de usuário e contribuinte Conam não configurados.' }
      }

      const isHom = config.ambienteEmissao === 'homologacao'
      const endpoint = isHom
        ? 'https://nfehomologacao.etransparencia.com.br/sp.taboaodaserra/webservice/aws_nfe.aspx'
        : 'https://nfe.etransparencia.com.br/sp.taboaodaserra/webservice/aws_nfe.aspx'
      const numero = input.numeroRps ?? String(Date.now())
      console.log('[TaboaoSerra/Conam] emitindo NFS-e', {
        ambiente: config.ambienteEmissao,
        endpoint,
        metodo: 'PROCESSARPS',
        codigoUsuarioCriptografado: codigoUsuario.criptografada,
        codigoContribuinteCriptografado: codigoContribuinte.criptografada,
        prestadorCnpjFinal: prestador.cnpj.replace(/\D/g, '').slice(-4),
      })

      const respXml = await soapCall(
        { endpoint, action: 'NFeaction/AWS_NFE.PROCESSARPS' },
        buildTaboaoEnvelope({
          codigoUsuario: codigoUsuario.valor,
          codigoContribuinte: codigoContribuinte.valor,
          input,
          config,
          prestador,
          numero,
        }),
      )
      const body = extractSoapBody(respXml)
      const erro = extractTag(body, 'Description') ?? extractTag(body, 'Mensagem') ?? extractTag(body, 'Message')
      const retorno = extractTag(body, 'Retorno')
      if (erro && retorno !== 'true' && !extractTag(body, 'Nota')) {
        return { sucesso: false, erro, detalhes: body }
      }

      const numNfse = extractTag(body, 'Nota')
        ?? extractTag(body, 'NumeroNFSe')
        ?? extractTag(body, 'NumeroNfse')
        ?? extractTag(body, 'Numero')

      return { sucesso: true, numeroNfse: numNfse, xmlNfse: body }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }
}
