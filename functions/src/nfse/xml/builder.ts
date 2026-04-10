/**
 * Construtores de XML para RPS/NFS-e padrão ABRASF 2.x.
 * Usados pelos conectores de Jundiaí, Campinas e Cajamar.
 */
import { Prestador, Servico, Tomador, REGIME_CODIGO } from '../types'

interface BuildRpsOpts {
  numero: string
  serie?: string
  tipo?: string              // '1' = RPS (padrão)
  naturezaOperacao?: string  // '1' = Tributação no município (padrão)
  optanteSimples: boolean
  incentivadorCultural?: boolean
  prestador: Prestador
  tomador: Tomador
  servico: Servico
  regimeTributario?: string
  dataEmissao?: Date
  infRpsId?: string
}

function fmt(n: number): string {
  return n.toFixed(2)
}

function fmtDataHora(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, '')
}

function cpfCnpjTag(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 14
    ? `<Cnpj>${digits}</Cnpj>`
    : `<Cpf>${digits}</Cpf>`
}

/**
 * Constrói o XML de um único RPS (padrão ABRASF 2.x) pronto para assinar.
 * O elemento InfRps recebe o Id para a assinatura digital.
 */
export function buildInfRpsXml(opts: BuildRpsOpts): string {
  const {
    numero, serie = 'RPS', tipo = '1',
    naturezaOperacao = '1',
    optanteSimples, incentivadorCultural = false,
    prestador, tomador, servico, regimeTributario,
    dataEmissao = new Date(),
    infRpsId = `rps${numero}`,
  } = opts

  const regimeCod = regimeTributario ? (REGIME_CODIGO[regimeTributario] ?? '1') : '1'
  const issRetidoCod = servico.issRetido ? '1' : '2'
  const valorIss = servico.valorServico * ((servico.aliquota ?? 0) / 100)

  return `<InfRps Id="${infRpsId}">
  <IdentificacaoRps>
    <Numero>${numero}</Numero>
    <Serie>${serie}</Serie>
    <Tipo>${tipo}</Tipo>
  </IdentificacaoRps>
  <DataEmissao>${fmtDataHora(dataEmissao)}</DataEmissao>
  <NaturezaOperacao>${naturezaOperacao}</NaturezaOperacao>
  <RegimeEspecialTributacao>${regimeCod}</RegimeEspecialTributacao>
  <OptanteSimplesNacional>${optanteSimples ? '1' : '2'}</OptanteSimplesNacional>
  <IncentivadorCultural>${incentivadorCultural ? '1' : '2'}</IncentivadorCultural>
  <Status>1</Status>
  <Servico>
    <Valores>
      <ValorServicos>${fmt(servico.valorServico)}</ValorServicos>
      ${servico.valorDeducoes != null ? `<ValorDeducoes>${fmt(servico.valorDeducoes)}</ValorDeducoes>` : ''}
      ${servico.valorPis != null ? `<ValorPis>${fmt(servico.valorPis)}</ValorPis>` : ''}
      ${servico.valorCofins != null ? `<ValorCofins>${fmt(servico.valorCofins)}</ValorCofins>` : ''}
      ${servico.valorInss != null ? `<ValorInss>${fmt(servico.valorInss)}</ValorInss>` : ''}
      ${servico.valorIr != null ? `<ValorIr>${fmt(servico.valorIr)}</ValorIr>` : ''}
      ${servico.valorCsll != null ? `<ValorCsll>${fmt(servico.valorCsll)}</ValorCsll>` : ''}
      ${servico.outrasRetencoes != null ? `<OutrasRetencoes>${fmt(servico.outrasRetencoes)}</OutrasRetencoes>` : ''}
      <IssRetido>${issRetidoCod}</IssRetido>
      ${servico.aliquota != null ? `<Aliquota>${fmt(servico.aliquota)}</Aliquota>` : ''}
      ${servico.valorDeducoes == null ? `<ValorIss>${fmt(valorIss)}</ValorIss>` : ''}
      ${servico.descontoIncondicionado != null ? `<DescontoIncondicionado>${fmt(servico.descontoIncondicionado)}</DescontoIncondicionado>` : ''}
      ${servico.descontoCondicionado != null ? `<DescontoCondicionado>${fmt(servico.descontoCondicionado)}</DescontoCondicionado>` : ''}
    </Valores>
    <ItemListaServico>${servico.itemListaServico ?? servico.codigoServico}</ItemListaServico>
    ${servico.cnae ? `<CodigoCnae>${servico.cnae}</CodigoCnae>` : ''}
    <Discriminacao>${escapeXml(servico.discriminacao)}</Discriminacao>
    <CodigoMunicipio>${servico.municipioPrestacao ?? prestador.municipioIbge}</CodigoMunicipio>
  </Servico>
  <Prestador>
    <CpfCnpj>${cpfCnpjTag(prestador.cnpj)}</CpfCnpj>
    <InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>
  </Prestador>
  <Tomador>
    <IdentificacaoTomador>
      <CpfCnpj>${cpfCnpjTag(tomador.cpfCnpj)}</CpfCnpj>
    </IdentificacaoTomador>
    <RazaoSocial>${escapeXml(tomador.razaoSocial)}</RazaoSocial>
    ${tomador.email ? `<Contato><Email>${escapeXml(tomador.email)}</Email></Contato>` : ''}
    ${tomador.endereco ? buildEnderecoXml(tomador.endereco) : ''}
  </Tomador>
</InfRps>`
}

function buildEnderecoXml(e: NonNullable<Tomador['endereco']>): string {
  if (!e.logradouro && !e.municipioIbge) return ''
  return `<Endereco>
    ${e.logradouro ? `<Endereco>${escapeXml(e.logradouro)}</Endereco>` : ''}
    ${e.numero ? `<Numero>${escapeXml(e.numero)}</Numero>` : ''}
    ${e.complemento ? `<Complemento>${escapeXml(e.complemento)}</Complemento>` : ''}
    ${e.bairro ? `<Bairro>${escapeXml(e.bairro)}</Bairro>` : ''}
    ${e.municipioIbge ? `<CodigoMunicipio>${e.municipioIbge}</CodigoMunicipio>` : ''}
    ${e.uf ? `<Uf>${e.uf}</Uf>` : ''}
    ${e.cep ? `<Cep>${e.cep.replace(/\D/g, '')}</Cep>` : ''}
  </Endereco>`
}

/**
 * Envolve um InfRps já assinado em um elemento Rps completo.
 */
export function buildRpsXml(infRpsXmlAssinado: string): string {
  return `<Rps>${infRpsXmlAssinado}</Rps>`
}

/**
 * Constrói o InfLoteRps para envio em lote (padrão ABRASF).
 */
export function buildLoteRpsXml(opts: {
  numeroLote: string
  cnpjPrestador: string
  inscricaoMunicipal: string
  rpsListXml: string   // lista de <Rps>...</Rps> já assinados
  quantidadeRps: number
  infLoteId?: string
}): string {
  const { numeroLote, cnpjPrestador, inscricaoMunicipal, rpsListXml, quantidadeRps, infLoteId = `lote${numeroLote}` } = opts
  const digits = cnpjPrestador.replace(/\D/g, '')
  return `<InfLoteRps Id="${infLoteId}" versao="2.04">
  <NumeroLote>${numeroLote}</NumeroLote>
  <CpfCnpj><Cnpj>${digits}</Cnpj></CpfCnpj>
  <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
  <QuantidadeRps>${quantidadeRps}</QuantidadeRps>
  <ListaRps>
    ${rpsListXml}
  </ListaRps>
</InfLoteRps>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
