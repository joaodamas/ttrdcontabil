/**
 * Conector São Paulo — Nota Fiscal Paulistana (schema proprietário)
 * WebService: https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx
 * Documentação: https://notadomilhao.sf.prefeitura.sp.gov.br/desenvolvedor/
 *
 * SP usa schema próprio (não ABRASF). O XML de envio tem estrutura diferente.
 * A partir de jan/2026 passou a transmitir ao ADN (SEFAZ) mas mantém emissor local.
 */
import { assinarXml, extrairChaveDoPfx } from '../xml/signer'
import { soapCall, buildSoapEnvelope, extractSoapBody, extractTag } from '../xml/soap'
import { CertificadoA1, ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'

const XMLNS_NFSE_SP = 'http://www.prefeitura.sp.gov.br/nfe'

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmt(n: number) { return n.toFixed(2) }

export class SaoPauloConector {
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

      // SP usa um RPS no formato próprio
      const rpsId = `rps${numero}`
      const rpsXml = `<p1:RPS xmlns:p1="${XMLNS_NFSE_SP}" Id="${rpsId}">
  <p1:ChaveRPS>
    <p1:InscricaoPrestador>${prestador.inscricaoMunicipal}</p1:InscricaoPrestador>
    <p1:SerieRPS>${input.serieRps ?? 'RPS'}</p1:SerieRPS>
    <p1:NumeroRPS>${numero}</p1:NumeroRPS>
  </p1:ChaveRPS>
  <p1:TipoRPS>RPS</p1:TipoRPS>
  <p1:DataEmissao>${new Date().toISOString().split('T')[0]}</p1:DataEmissao>
  <p1:StatusRPS>N</p1:StatusRPS>
  <p1:TributacaoRPS>${config.optanteSimples ? 'T' : 'T'}</p1:TributacaoRPS>
  <p1:ValorServicos>${fmt(input.servico.valorServico)}</p1:ValorServicos>
  <p1:ValorDeducoes>${fmt(input.servico.valorDeducoes ?? 0)}</p1:ValorDeducoes>
  <p1:ValorPIS>${fmt(input.servico.valorPis ?? 0)}</p1:ValorPIS>
  <p1:ValorCOFINS>${fmt(input.servico.valorCofins ?? 0)}</p1:ValorCOFINS>
  <p1:ValorINSS>${fmt(input.servico.valorInss ?? 0)}</p1:ValorINSS>
  <p1:ValorIR>${fmt(input.servico.valorIr ?? 0)}</p1:ValorIR>
  <p1:ValorCSLL>${fmt(input.servico.valorCsll ?? 0)}</p1:ValorCSLL>
  <p1:CodigoServico>${input.servico.codigoServico.replace('.', '')}</p1:CodigoServico>
  <p1:AliquotaServicos>${fmt(input.servico.aliquota ?? config.aliquotaPadrao ?? 5)}</p1:AliquotaServicos>
  <p1:ISSRetido>${input.servico.issRetido ? 'true' : 'false'}</p1:ISSRetido>
  <p1:CPFCNPJTomador>
    ${input.tomador.cpfCnpj.replace(/\D/g, '').length === 14
      ? `<p1:CNPJ>${input.tomador.cpfCnpj.replace(/\D/g, '')}</p1:CNPJ>`
      : `<p1:CPF>${input.tomador.cpfCnpj.replace(/\D/g, '')}</p1:CPF>`}
  </p1:CPFCNPJTomador>
  <p1:RazaoSocialTomador>${escapeXml(input.tomador.razaoSocial)}</p1:RazaoSocialTomador>
  ${input.tomador.email ? `<p1:EmailTomador>${escapeXml(input.tomador.email)}</p1:EmailTomador>` : ''}
  <p1:Discriminacao>${escapeXml(input.servico.discriminacao)}</p1:Discriminacao>
</p1:RPS>`

      // Assina o RPS
      const rpsAssinado = assinarXml(rpsXml, rpsId, chave)

      // Envolve no EnvioRPS
      const loteId = `lote${Date.now()}`
      const envioXml = `<p1:EnvioLoteRPS xmlns:p1="${XMLNS_NFSE_SP}" Id="${loteId}">
  <p1:Cabecalho Versao="1" xmlns:p1="${XMLNS_NFSE_SP}">
    <p1:CPFCNPJRemetente>
      <p1:CNPJ>${prestador.cnpj.replace(/\D/g, '')}</p1:CNPJ>
    </p1:CPFCNPJRemetente>
    <p1:transacao>true</p1:transacao>
    <p1:dtInicio>${new Date().toISOString().split('T')[0]}</p1:dtInicio>
    <p1:dtFim>${new Date().toISOString().split('T')[0]}</p1:dtFim>
    <p1:QtdRPS>1</p1:QtdRPS>
    <p1:ValorTotalServicos>${fmt(input.servico.valorServico)}</p1:ValorTotalServicos>
    <p1:ValorTotalDeducoes>0.00</p1:ValorTotalDeducoes>
  </p1:Cabecalho>
  ${rpsAssinado}
</p1:EnvioLoteRPS>`

      const envioAssinado = assinarXml(envioXml, loteId, chave)

      const endpoint = isHom
        ? 'https://nfews.prefeitura.sp.gov.br/lotenfe.asmx'
        : 'https://nfews.prefeitura.sp.gov.br/lotenfe.asmx'

      const soapBody = buildSoapEnvelope(
        `<EnvioLoteRPS xmlns="${XMLNS_NFSE_SP}">${envioAssinado}</EnvioLoteRPS>`,
        { 'p1': XMLNS_NFSE_SP }
      )

      const respXml = await soapCall({
        endpoint,
        action: `${XMLNS_NFSE_SP}/EnvioLoteRPS`,
        certPem: chave.certPem,
        keyPem: chave.privateKeyPem,
      }, soapBody)

      const bodyXml = extractSoapBody(respXml)
      const erro    = extractTag(bodyXml, 'Erro')
      if (erro) {
        const cod = extractTag(bodyXml, 'Codigo')
        const msg = extractTag(bodyXml, 'Descricao') ?? erro
        return { sucesso: false, erro: msg, codigoErro: cod, detalhes: bodyXml }
      }

      const numNfse = extractTag(bodyXml, 'NumeroNFe') ?? extractTag(bodyXml, 'NumeroNFSe')
      const codVerif = extractTag(bodyXml, 'CodigoVerificacao')

      return { sucesso: true, numeroNfse: numNfse, codigoVerificacao: codVerif, xmlNfse: bodyXml }
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }
}
