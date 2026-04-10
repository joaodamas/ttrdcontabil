/**
 * Conector Barueri — Sistema próprio (SOAP proprietário + A1)
 * Portal: https://www.barueri.sp.gov.br/nfe/
 * Homologação: https://testeeiss.barueri.sp.gov.br/nfe/
 * Autenticação: Certificado A1
 */
import { assinarXml, extrairChaveDoPfx } from '../xml/signer'
import { soapCall, buildSoapEnvelope, extractSoapBody, extractTag } from '../xml/soap'
import { CertificadoA1, ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'

function fmt(n: number) { return n.toFixed(2) }
function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const XMLNS_BARUERI = 'http://www.barueri.sp.gov.br/wsNFe'

export class BarueriConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    cert: CertificadoA1,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const isHom  = config.ambienteEmissao === 'homologacao'
      const chave  = extrairChaveDoPfx(cert.pfxBase64, cert.senha)
      const numero = input.numeroRps ?? String(Date.now()).slice(-8)
      const rpsId  = `rps${numero}`

      const rpsXml = `<nfe:RPS xmlns:nfe="${XMLNS_BARUERI}" Id="${rpsId}">
  <nfe:InscricaoPrestador>${prestador.inscricaoMunicipal}</nfe:InscricaoPrestador>
  <nfe:SerieRPS>${input.serieRps ?? 'RPS'}</nfe:SerieRPS>
  <nfe:NumeroRPS>${numero}</nfe:NumeroRPS>
  <nfe:DataEmissaoRPS>${new Date().toISOString().split('T')[0]}</nfe:DataEmissaoRPS>
  <nfe:SituacaoRPS>N</nfe:SituacaoRPS>
  <nfe:SerieRPSSubstituido/>
  <nfe:NumeroRPSSubstituido/>
  <nfe:NumeroNFSeSubstituida/>
  <nfe:DataEmissaoNFSeSubstituida/>
  <nfe:SectorServico>1</nfe:SectorServico>
  <nfe:Operacao>A</nfe:Operacao>
  <nfe:Tributacao>T</nfe:Tributacao>
  <nfe:ValorServicos>${fmt(input.servico.valorServico)}</nfe:ValorServicos>
  <nfe:ValorDeducoes>${fmt(input.servico.valorDeducoes ?? 0)}</nfe:ValorDeducoes>
  <nfe:ValorPIS>${fmt(input.servico.valorPis ?? 0)}</nfe:ValorPIS>
  <nfe:ValorCOFINS>${fmt(input.servico.valorCofins ?? 0)}</nfe:ValorCOFINS>
  <nfe:ValorINSS>${fmt(input.servico.valorInss ?? 0)}</nfe:ValorINSS>
  <nfe:ValorIR>${fmt(input.servico.valorIr ?? 0)}</nfe:ValorIR>
  <nfe:ValorCSLL>${fmt(input.servico.valorCsll ?? 0)}</nfe:ValorCSLL>
  <nfe:CodigoServico>${input.servico.codigoServico.replace('.', '')}</nfe:CodigoServico>
  <nfe:AliquotaServicos>${fmt(input.servico.aliquota ?? config.aliquotaPadrao ?? 5)}</nfe:AliquotaServicos>
  <nfe:ISSRetido>${input.servico.issRetido ? 'true' : 'false'}</nfe:ISSRetido>
  <nfe:CPFCNPJTomador>${input.tomador.cpfCnpj.replace(/\D/g, '')}</nfe:CPFCNPJTomador>
  <nfe:RazaoSocialTomador>${escapeXml(input.tomador.razaoSocial)}</nfe:RazaoSocialTomador>
  ${input.tomador.email ? `<nfe:EmailTomador>${escapeXml(input.tomador.email)}</nfe:EmailTomador>` : '<nfe:EmailTomador/>'}
  <nfe:Discriminacao>${escapeXml(input.servico.discriminacao)}</nfe:Discriminacao>
  <nfe:MunicipioPrestacaoServico>${prestador.municipioIbge}</nfe:MunicipioPrestacaoServico>
</nfe:RPS>`

      const rpsAssinado = assinarXml(rpsXml, rpsId, chave)
      const loteId      = `lote${Date.now()}`

      const loteXml = `<nfe:EnvioLoteRPS xmlns:nfe="${XMLNS_BARUERI}" Id="${loteId}">
  <nfe:Cabecalho Versao="1">
    <nfe:CPFCNPJRemetente>${prestador.cnpj.replace(/\D/g, '')}</nfe:CPFCNPJRemetente>
    <nfe:transacao>true</nfe:transacao>
    <nfe:dtInicio>${new Date().toISOString().split('T')[0]}</nfe:dtInicio>
    <nfe:dtFim>${new Date().toISOString().split('T')[0]}</nfe:dtFim>
    <nfe:QtdRPS>1</nfe:QtdRPS>
    <nfe:ValorTotalServicos>${fmt(input.servico.valorServico)}</nfe:ValorTotalServicos>
    <nfe:ValorTotalDeducoes>0.00</nfe:ValorTotalDeducoes>
  </nfe:Cabecalho>
  ${rpsAssinado}
</nfe:EnvioLoteRPS>`

      const loteAssinado = assinarXml(loteXml, loteId, chave)

      const endpoint = isHom
        ? 'https://testeeiss.barueri.sp.gov.br/nfe/RecepcionarLoteRPS.asmx'
        : 'https://www.barueri.sp.gov.br/nfe/RecepcionarLoteRPS.asmx'

      const soapBody = buildSoapEnvelope(loteAssinado, { nfe: XMLNS_BARUERI })
      const respXml  = await soapCall({ endpoint, action: `${XMLNS_BARUERI}/EnvioLoteRPS` }, soapBody)
      const bodyXml  = extractSoapBody(respXml)

      const erro = extractTag(bodyXml, 'Erro') ?? extractTag(bodyXml, 'MensagemRetorno')
      if (erro && !bodyXml.includes('NumeroNFe')) {
        return { sucesso: false, erro, detalhes: bodyXml }
      }

      const numNfse  = extractTag(bodyXml, 'NumeroNFe') ?? extractTag(bodyXml, 'Numero')
      const codVerif = extractTag(bodyXml, 'CodigoVerificacao')

      return { sucesso: true, numeroNfse: numNfse, codigoVerificacao: codVerif, xmlNfse: bodyXml }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }
}
