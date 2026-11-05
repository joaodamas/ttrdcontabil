// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DanfseXmlInvalidoError,
  montarDadosDanfse,
  resumoNfse,
} from '../../functions/src/nfse/danfse/dados'
import {
  formatarCep,
  formatarCnpjCpf,
  formatarDataHora,
  formatarMoeda,
  formatarNbs,
  somarDecimais,
  urlConsultaPublica,
} from '../../functions/src/nfse/danfse/descricoes'
import { renderizarDanfsePdf } from '../../functions/src/nfse/danfse/render'
import { caminhoDanfse, nomeArquivoDanfse } from '../../functions/src/nfse/danfse/servico'

const FIXTURES = path.resolve(__dirname, '../fixtures/nfse')
const xmlHomologacao = readFileSync(path.join(FIXTURES, 'nfse-nacional-homologacao.xml'), 'utf8')
const xmlLucroPresumido = readFileSync(path.join(FIXTURES, 'nfse-nacional-lucro-presumido.xml'), 'utf8')

describe('montarDadosDanfse — NFS-e real da produção restrita (anonimizada)', () => {
  const d = montarDadosDanfse(xmlHomologacao)

  it('extrai a chave de acesso (Id sem o prefixo NFS) e a URL oficial de consulta', () => {
    expect(d.chaveAcesso).toBe('35503082211222333000181000000000000126114347282284')
    expect(d.chaveAcesso).toHaveLength(50)
    expect(d.urlConsulta).toBe(
      'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=35503082211222333000181000000000000126114347282284',
    )
  })

  it('marca homologação (tpAmb = 2) e monta o cabeçalho', () => {
    expect(d.homologacao).toBe(true)
    expect(d.cabecalho).toEqual({
      municipio: 'São Paulo / SP',
      ambienteGerador: 'Sistema Nacional da NFS-e',
      tipoAmbiente: 'Homologação',
    })
  })

  it('formata os dados de identificação', () => {
    expect(d.identificacao).toEqual({
      numeroNfse: '1',
      competencia: '15/08/2025',
      dataHoraEmissaoNfse: '05/11/2026 14:09:07',
      numeroDps: '1',
      serieDps: '900',
      dataHoraEmissaoDps: '05/11/2026 14:08:57',
      emitente: 'Prestador',
      situacao: 'NFS-e Gerada',
      finalidade: 'NFS-e regular',
    })
  })

  it('completa o prestador com o grupo emit da NFS-e', () => {
    expect(d.prestador.documento).toBe('11.222.333/0001-81')
    expect(d.prestador.nome).toBe('PRESTADOR FICTICIO & CIA LTDA')
    expect(d.prestador.endereco).toBe('RUA DO PRESTADOR FICTICIO, 500, BAIRRO TESTE')
    expect(d.prestador.municipioUf).toBe('São Paulo / SP')
    expect(d.prestador.ibgeCep).toBe('3550308 / 01.001-000')
    expect(d.prestador.simplesNacional).toBe('Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)')
    expect(d.prestador.regimeApuracaoSn).toMatch(/^Regime de apuração dos tributos federais e municipal pelo Simples/)
  })

  it('lê o tomador e reduz destinatário/intermediário ausentes', () => {
    expect(d.tomador).toMatchObject({
      documento: '11.444.777/0001-61',
      nome: 'TOMADOR FICTICIO DE TESTE LTDA',
      municipioUf: 'São Paulo / SP',
      ibgeCep: '3550308 / 01.310-100',
      endereco: 'Rua Exemplo, 100, Centro',
      email: 'teste@example.com',
    })
    expect(d.destinatario).toBeNull()
    expect(d.intermediario).toBeNull()
  })

  it('serviço, tributação e valores', () => {
    expect(d.servico).toMatchObject({
      codigoTributacao: '01.01.01',
      localPrestacao: 'São Paulo / SP / BR',
      descricaoCodigoTributacao: 'Análise e desenvolvimento de sistemas.',
      descricao: 'Servico de teste - PRODUCAO RESTRITA, sem validade juridica',
    })
    expect(d.tributacaoMunicipal?.tipoTributacao).toBe('Operação Tributável')
    expect(d.tributacaoMunicipal?.retencao).toBe('Não Retido')
    expect(d.tributacaoMunicipal?.baseCalculo).toBeUndefined()
    expect(d.valorTotal.valorServico).toBe('R$ 10,00')
    expect(d.valorTotal.valorLiquido).toBe('R$ 10,00')
    expect(d.valorTotal.valorLiquidoIbsCbs).toBeUndefined()
    expect(d.tributacaoFederal.exibirPisCofins).toBe(true)
    expect(d.totaisAproximados).toBe('Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Simples Nacional: 6,00%')
  })
})

describe('montarDadosDanfse — fixture sintética (lucro presumido, ISS retido)', () => {
  const d = montarDadosDanfse(xmlLucroPresumido)

  it('produção e prestador com IM/telefone', () => {
    expect(d.homologacao).toBe(false)
    expect(d.cabecalho.tipoAmbiente).toBe('Produção')
    expect(d.prestador.inscricaoMunicipal).toBe('123456')
    expect(d.prestador.endereco).toBe('AVENIDA DAS AMOSTRAS, 1500, SALA 12, CENTRO')
    expect(d.prestador.simplesNacional).toBe('Não Optante')
    expect(d.identificacao.finalidade).toBeUndefined()
  })

  it('tomador pessoa física em outro município', () => {
    expect(d.tomador?.documento).toBe('529.982.247-25')
    expect(d.tomador?.municipioUf).toBe('São Paulo / SP')
  })

  it('usa a descrição municipal do código de tributação quando houver', () => {
    expect(d.servico.codigoTributacao).toBe('01.06.01 / 001')
    expect(d.servico.codigoNbs).toBe('1.1502.10.00')
    expect(d.servico.descricaoCodigoTributacao).toBe('Consultoria e assessoria em informática')
  })

  it('tributação municipal e federal', () => {
    expect(d.tributacaoMunicipal).toMatchObject({
      municipioIncidencia: 'Campinas / SP / BR',
      totalDeducoesReducoes: 'R$ 100,00',
      baseCalculo: 'R$ 4.900,00',
      aliquota: '5,00%',
      retencao: 'Retido pelo Tomador',
      issqnApurado: 'R$ 245,00',
    })
    expect(d.tributacaoFederal).toMatchObject({
      irrf: 'R$ 75,00',
      contribuicoesSociais: 'R$ 50,00',
      pis: 'R$ 32,50',
      cofins: 'R$ 150,00',
      descricaoContribuicoes: 'PIS/COFINS/CSLL Retidos',
    })
    expect(d.valorTotal.totalRetencoes).toBe('R$ 552,50')
    expect(d.valorTotal.valorLiquido).toBe('R$ 4.447,50')
  })

  it('informações complementares na ordem da NT e totais aproximados', () => {
    expect(d.informacoesComplementares).toEqual([
      'Inf. Cont.: Pagamento via boleto com vencimento em 10/11/2026.',
      'Núm. Ped.: PC-2026-0042',
    ])
    expect(d.totaisAproximados).toBe(
      'Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: R$ 600,00; Estaduais: R$ 0,00; Municipais: R$ 245,00',
    )
  })
})

describe('montarDadosDanfse — XML inválido', () => {
  it('recusa XML que não é do padrão nacional (ex.: ABRASF)', () => {
    expect(() => montarDadosDanfse('<CompNfse><Nfse><InfNfse><Numero>1</Numero></InfNfse></Nfse></CompNfse>'))
      .toThrow(DanfseXmlInvalidoError)
  })
  it('recusa XML vazio ou malformado', () => {
    expect(() => montarDadosDanfse('')).toThrow(DanfseXmlInvalidoError)
    expect(() => montarDadosDanfse('<NFSe><infNFSe')).toThrow(DanfseXmlInvalidoError)
  })
  it('recusa NFS-e sem chave de acesso válida', () => {
    const semChave = xmlHomologacao.replace(/Id="NFS\d+"/, 'Id="NFS123"')
    expect(() => montarDadosDanfse(semChave)).toThrow(/Chave de acesso/)
  })
  it('resumoNfse devolve chave e número', () => {
    expect(resumoNfse(xmlLucroPresumido)).toEqual({
      chaveAcesso: '35095022111222333000181000000000004226110000012345',
      numeroNfse: '42',
    })
  })
})

describe('formatações do DANFSe', () => {
  it('documentos, CEP, datas, moeda e NBS', () => {
    expect(formatarCnpjCpf('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatarCnpjCpf('52998224725')).toBe('529.982.247-25')
    expect(formatarCep('5201200')).toBe('05.201-200')
    expect(formatarDataHora('2026-01-02T03:04:05-03:00')).toBe('02/01/2026 03:04:05')
    expect(formatarMoeda('1234567.8')).toBe('R$ 1.234.567,80')
    expect(formatarNbs('115021000')).toBe('1.1502.10.00')
    expect(somarDecimais('0.10', '0.20', undefined)).toBe('0.30')
    expect(somarDecimais(undefined)).toBeUndefined()
    expect(urlConsultaPublica('1'.repeat(50))).toBe(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${'1'.repeat(50)}`)
  })
})

describe('renderizarDanfsePdf', () => {
  it('gera um PDF de uma única página', async () => {
    const pdf = await renderizarDanfsePdf(montarDadosDanfse(xmlLucroPresumido), {
      cancelada: true,
      geradoEm: new Date('2026-11-05T12:00:00Z'),
    })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const paginas = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []
    expect(paginas).toHaveLength(1)
  })

  it('cabe numa página mesmo com descrição longa', async () => {
    const longa = 'Serviço prestado conforme contrato. '.repeat(60)
    const xml = xmlHomologacao.replace(
      /<xDescServ>[^<]*<\/xDescServ>/,
      `<xDescServ>${longa}</xDescServ>`,
    )
    const pdf = await renderizarDanfsePdf(montarDadosDanfse(xml))
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
  })
})

describe('armazenamento do DANFSe', () => {
  it('caminho determinístico por cliente/chave, com sufixo para cancelada', () => {
    expect(caminhoDanfse('cli-1', '123', false)).toBe('nfse/cli-1/123.pdf')
    expect(caminhoDanfse('cli-1', '123', true)).toBe('nfse/cli-1/123-cancelada.pdf')
    expect(caminhoDanfse('../x', '1/2', false)).toBe('nfse/x/12.pdf')
  })
  it('nome do arquivo', () => {
    expect(nomeArquivoDanfse('42', 'abc')).toBe('DANFSe-42-abc.pdf')
    expect(nomeArquivoDanfse(undefined, 'abc')).toBe('DANFSe-sem-numero-abc.pdf')
  })
})
