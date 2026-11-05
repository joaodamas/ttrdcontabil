import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  codigoNacionalDerivado,
  competenciaFutura,
  competenciaPadrao,
  competenciaParaData,
  competenciaParaInput,
  contemVariaveis,
  extrairDadosXmlNfse,
  formatarCompetencia,
  formatarNbs,
  itemLc116DoCodigoNacional,
  lerCompetencia,
  modeloDoFormulario,
  nbsValido,
  normalizarRegraCompetencia,
  notasParaCopia,
  renderizarDescricao,
  sugerirModeloComVariaveis,
  valoresDaNotaEmitida,
  valoresDoModelo,
  type NotaEmitidaParaCopia,
} from '@/lib/nfse-modelo'

const FIXTURES = path.resolve(__dirname, '../fixtures/nfse')
const xmlLucroPresumido = readFileSync(path.join(FIXTURES, 'nfse-nacional-lucro-presumido.xml'), 'utf8')

describe('competência padrão do cliente', () => {
  const hoje = new Date(2026, 10, 5) // 05/11/2026

  it('mes_atual (padrão, inclusive sem config) usa o mês da emissão', () => {
    expect(competenciaPadrao('mes_atual', hoje)).toEqual({ mes: 11, ano: 2026 })
    expect(competenciaPadrao(undefined, hoje)).toEqual({ mes: 11, ano: 2026 })
    expect(competenciaPadrao(null, hoje)).toEqual({ mes: 11, ano: 2026 })
  })

  it('mes_anterior volta um mês, virando o ano em janeiro', () => {
    expect(competenciaPadrao('mes_anterior', hoje)).toEqual({ mes: 10, ano: 2026 })
    expect(competenciaPadrao('mes_anterior', new Date(2027, 0, 15))).toEqual({ mes: 12, ano: 2026 })
  })

  it('manual não sugere nada', () => {
    expect(competenciaPadrao('manual', hoje)).toBeNull()
  })

  it('valor desconhecido cai em mes_atual', () => {
    expect(normalizarRegraCompetencia('qualquer')).toBe('mes_atual')
    expect(normalizarRegraCompetencia('mes_anterior')).toBe('mes_anterior')
  })

  it('conversões de formato', () => {
    expect(lerCompetencia('2026-10')).toEqual({ mes: 10, ano: 2026 })
    expect(lerCompetencia('2026-10-01')).toEqual({ mes: 10, ano: 2026 })
    expect(lerCompetencia('2026-13')).toBeNull()
    expect(lerCompetencia('')).toBeNull()
    expect(competenciaParaInput({ mes: 3, ano: 2026 })).toBe('2026-03')
    expect(competenciaParaData({ mes: 3, ano: 2026 })).toBe('2026-03-01')
    expect(formatarCompetencia({ mes: 3, ano: 2026 })).toBe('03/2026')
    expect(formatarCompetencia(null)).toBe('—')
  })

  it('competência futura', () => {
    expect(competenciaFutura({ mes: 12, ano: 2026 }, hoje)).toBe(true)
    expect(competenciaFutura({ mes: 11, ano: 2026 }, hoje)).toBe(false)
    expect(competenciaFutura({ mes: 1, ano: 2027 }, hoje)).toBe(true)
  })
})

describe('variáveis da descrição', () => {
  const out = { mes: 10, ano: 2026 }

  it('renderiza as três variáveis', () => {
    const t = 'PRESTAÇÃO DE SERVIÇOS REFERENTE AO MÊS {{MES_COMPETENCIA}} DE {{ANO_COMPETENCIA}} ({{MES_ANO_COMPETENCIA}})'
    expect(renderizarDescricao(t, out)).toBe('PRESTAÇÃO DE SERVIÇOS REFERENTE AO MÊS OUTUBRO DE 2026 (10/2026)')
    expect(renderizarDescricao('{{ MES_COMPETENCIA }}', { mes: 3, ano: 2027 })).toBe('MARÇO')
  })

  it('sem competência ou sem variável, devolve o texto como está', () => {
    expect(renderizarDescricao('Mês {{MES_COMPETENCIA}}', null)).toBe('Mês {{MES_COMPETENCIA}}')
    expect(renderizarDescricao('Texto fixo', out)).toBe('Texto fixo')
    expect(renderizarDescricao('{{OUTRA}}', out)).toBe('{{OUTRA}}')
  })

  it('contemVariaveis', () => {
    expect(contemVariaveis('MÊS {{MES_COMPETENCIA}}')).toBe(true)
    expect(contemVariaveis('MÊS OUTUBRO')).toBe(false)
    expect(contemVariaveis(undefined)).toBe(false)
  })
})

describe('sugestão "Converter em modelo com variáveis"', () => {
  const out = { mes: 10, ano: 2026 }

  it('troca "OUTUBRO DE 2026" pela competência da nota de origem', () => {
    const s = sugerirModeloComVariaveis('PRESTAÇÃO DE SERVIÇOS REFERENTE AO MÊS OUTUBRO DE 2026. DADOS PARA PAGAMENTO …', out)
    expect(s).toEqual({
      antes: 'PRESTAÇÃO DE SERVIÇOS REFERENTE AO MÊS OUTUBRO DE 2026. DADOS PARA PAGAMENTO …',
      depois: 'PRESTAÇÃO DE SERVIÇOS REFERENTE AO MÊS {{MES_COMPETENCIA}} DE {{ANO_COMPETENCIA}}. DADOS PARA PAGAMENTO …',
    })
  })

  it('aceita minúsculas, barra e o formato numérico', () => {
    expect(sugerirModeloComVariaveis('Consultoria referente a outubro/2026, contrato 123/2026', out)?.depois)
      .toBe('Consultoria referente a {{MES_COMPETENCIA}}/{{ANO_COMPETENCIA}}, contrato 123/2026')
    expect(sugerirModeloComVariaveis('Honorários 10/2026', out)?.depois).toBe('Honorários {{MES_ANO_COMPETENCIA}}')
  })

  it('MARÇO com ou sem cedilha', () => {
    const mar = { mes: 3, ano: 2026 }
    expect(sugerirModeloComVariaveis('Ref. MARCO DE 2026', mar)?.depois).toBe('Ref. {{MES_COMPETENCIA}} DE {{ANO_COMPETENCIA}}')
    expect(sugerirModeloComVariaveis('Ref. Março de 2026 e 3/2026', mar)?.depois).toBe('Ref. {{MES_COMPETENCIA}} de {{ANO_COMPETENCIA}} e {{MES_ANO_COMPETENCIA}}')
  })

  it('só a competência da nota: outro mês ou outro ano não vira variável', () => {
    expect(sugerirModeloComVariaveis('Referente a SETEMBRO DE 2026', out)).toBeNull()
    expect(sugerirModeloComVariaveis('Referente a OUTUBRO DE 2025', out)).toBeNull()
    expect(sugerirModeloComVariaveis('Honorários 09/2026', out)).toBeNull()
  })

  it('não confunde o fim de uma data completa nem números maiores', () => {
    expect(sugerirModeloComVariaveis('Vencimento em 05/10/2026', out)).toBeNull()
    expect(sugerirModeloComVariaveis('Pedido 110/2026', out)).toBeNull()
    expect(sugerirModeloComVariaveis('Lote 10/20261', out)).toBeNull()
  })

  it('sem competência de origem ou sem texto: nada a sugerir', () => {
    expect(sugerirModeloComVariaveis('OUTUBRO DE 2026', null)).toBeNull()
    expect(sugerirModeloComVariaveis('', out)).toBeNull()
  })
})

describe('XML oficial → dados para cópia', () => {
  it('lê tomador com endereço, serviço, local, NBS, informações complementares e competência', () => {
    const d = extrairDadosXmlNfse(xmlLucroPresumido)
    expect(d).toMatchObject({
      numeroNfse: '42',
      competencia: { mes: 10, ano: 2026 },
      tomadorCpfCnpj: '52998224725',
      tomadorNome: 'JOSÉ DA SILVA TESTE',
      tomadorEmail: 'jose@example.com',
      tomadorCep: '01310100',
      tomadorLogradouro: 'Avenida Paulista',
      tomadorNumero: '1000',
      tomadorComplemento: 'Conjunto 101',
      tomadorBairro: 'Bela Vista',
      tomadorMunicipioIbge: '3550308',
      codigoTributacaoNacional: '010601',
      codigoNbs: '115021000',
      municipioPrestacaoIbge: '3509502',
      informacoesComplementares: 'Pagamento via boleto com vencimento em 10/11/2026.',
      valorServico: 5000,
      aliquota: 5,
      issRetido: true,
    })
  })

  it('XML vazio, malformado ou de outro padrão = null', () => {
    expect(extrairDadosXmlNfse('')).toBeNull()
    expect(extrairDadosXmlNfse(null)).toBeNull()
    expect(extrairDadosXmlNfse('<nao-fecha')).toBeNull()
    expect(extrairDadosXmlNfse('<CompNfse><Nfse/></CompNfse>')).toBeNull()
  })
})

describe('nota emitida → valores do formulário', () => {
  const base: NotaEmitidaParaCopia = {
    id: 'n1',
    numeroNfse: '15',
    dataCompetencia: '2026-10-01',
    tomadorNome: 'Tomador Ltda',
    tomadorCpfCnpj: '11.444.777/0001-61',
    tomadorEmail: 'fin@tomador.com',
    tomadorEndereco: { cep: '01001-000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', municipio: 'São Paulo', municipioIbge: '3550308', uf: 'SP' },
    descricaoServico: 'SERVIÇOS DE OUTUBRO DE 2026',
    codigoServico: '0102',
    itemListaServico: '1.02',
    codigoTributacaoNacional: '010201',
    codigoNbs: '1.1501.10.00',
    municipioPrestacaoIbge: '3550308',
    valorServico: 3500,
    aliquota: 2,
    issRetido: false,
    informacoesComplementares: 'Banco 001',
  }

  it('copia os campos gravados (CPF/CNPJ e CEP só dígitos), sem número nem competência', () => {
    const r = valoresDaNotaEmitida(base)
    expect(r.numeroNfse).toBe('15')
    expect(r.competenciaOrigem).toEqual({ mes: 10, ano: 2026 })
    expect(r.valores).toEqual({
      tomadorNome: 'Tomador Ltda',
      tomadorCpfCnpj: '11444777000161',
      tomadorEmail: 'fin@tomador.com',
      tomadorCep: '01001000',
      tomadorLogradouro: 'Rua A',
      tomadorNumero: '10',
      tomadorBairro: 'Centro',
      tomadorMunicipio: 'São Paulo',
      tomadorMunicipioIbge: '3550308',
      tomadorUf: 'SP',
      descricaoServico: 'SERVIÇOS DE OUTUBRO DE 2026',
      codigoServico: '0102',
      itemListaServico: '1.02',
      codigoTributacaoNacional: '010201',
      codigoNbs: '1.1501.10.00',
      municipioPrestacaoIbge: '3550308',
      valorServico: 3500,
      aliquota: 2,
      issRetido: false,
      informacoesComplementares: 'Banco 001',
    })
    expect(r.valores).not.toHaveProperty('competencia')
    expect(r.valores).not.toHaveProperty('numeroNfse')
  })

  it('nota emitida de um modelo volta com a descrição-modelo (com variáveis)', () => {
    const r = valoresDaNotaEmitida({ ...base, descricaoServicoModelo: 'SERVIÇOS DE {{MES_COMPETENCIA}} DE {{ANO_COMPETENCIA}}' })
    expect(r.valores.descricaoServico).toBe('SERVIÇOS DE {{MES_COMPETENCIA}} DE {{ANO_COMPETENCIA}}')
  })

  it('nota antiga (só campos básicos) completa endereço, NBS, local e inf. complementares pelo XML', () => {
    const antiga: NotaEmitidaParaCopia = {
      id: 'n2',
      tomadorNome: 'JOSÉ DA SILVA TESTE',
      tomadorCpfCnpj: '52998224725',
      descricaoServico: 'Consultoria',
      codigoServico: '1.06',
      valorServico: 5000,
      aliquota: null,
      issRetido: true,
      xmlNfse: xmlLucroPresumido,
    }
    const r = valoresDaNotaEmitida(antiga, extrairDadosXmlNfse(antiga.xmlNfse))
    expect(r.numeroNfse).toBe('42')
    expect(r.competenciaOrigem).toEqual({ mes: 10, ano: 2026 })
    expect(r.valores).toMatchObject({
      tomadorEmail: 'jose@example.com',
      tomadorCep: '01310100',
      tomadorLogradouro: 'Avenida Paulista',
      tomadorMunicipioIbge: '3550308',
      descricaoServico: 'Consultoria', // gravado vence o XML
      itemListaServico: '1.06',
      codigoNbs: '1.1502.10.00',
      municipioPrestacaoIbge: '3509502',
      informacoesComplementares: 'Pagamento via boleto com vencimento em 10/11/2026.',
      aliquota: 5,
      issRetido: true,
    })
    // 010601 é o que o item 1.06 já deriva: não vira override.
    expect(r.valores.codigoTributacaoNacional).toBeUndefined()
  })

  it('cTribNac do XML com desdobro diferente de 01 vira override explícito', () => {
    const xml = xmlLucroPresumido.replace('<cTribNac>010601</cTribNac>', '<cTribNac>010602</cTribNac>')
    const r = valoresDaNotaEmitida({ id: 'n3' }, extrairDadosXmlNfse(xml))
    expect(r.valores.itemListaServico).toBe('1.06')
    expect(r.valores.codigoTributacaoNacional).toBe('010602')
  })
})

describe('modelo padrão do cliente', () => {
  it('ida e volta formulário → modelo → formulário, sem undefined no mapa', () => {
    const modelo = modeloDoFormulario({
      tomadorNome: 'Tomador', tomadorCpfCnpj: '11.444.777/0001-61', tomadorEmail: '',
      tomadorCep: '01001-000', tomadorLogradouro: 'Rua A', tomadorNumero: '1', tomadorBairro: 'Centro', tomadorMunicipioIbge: '3550308',
      descricaoServico: 'Mês {{MES_COMPETENCIA}}', codigoServico: '0102', itemListaServico: '1.02',
      codigoNbs: '1.1501.10.00', municipioPrestacaoIbge: '3525904', valorServico: 100, aliquota: Number.NaN, issRetido: false,
      informacoesComplementares: 'Banco',
    }, new Date('2026-11-05T12:00:00Z'))
    expect(JSON.stringify(modelo)).not.toContain('undefined')
    expect(modelo).toMatchObject({
      tomador: { nome: 'Tomador', cpfCnpj: '11444777000161', email: null, endereco: { cep: '01001000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', municipioIbge: '3550308' } },
      descricaoServico: 'Mês {{MES_COMPETENCIA}}',
      codigoTributacaoNacional: null,
      aliquota: null,
      salvoEm: '2026-11-05T12:00:00.000Z',
    })
    expect(modelo.tomador.endereco).not.toHaveProperty('complemento')
    expect(valoresDoModelo(modelo)).toEqual({
      tomadorNome: 'Tomador', tomadorCpfCnpj: '11444777000161',
      tomadorCep: '01001000', tomadorLogradouro: 'Rua A', tomadorNumero: '1', tomadorBairro: 'Centro', tomadorMunicipioIbge: '3550308',
      descricaoServico: 'Mês {{MES_COMPETENCIA}}', codigoServico: '0102', itemListaServico: '1.02',
      codigoNbs: '1.1501.10.00', municipioPrestacaoIbge: '3525904', valorServico: 100, issRetido: false,
      informacoesComplementares: 'Banco',
    })
  })

  it('modelo ausente ou vazio = null', () => {
    expect(valoresDoModelo(undefined)).toBeNull()
    expect(valoresDoModelo({})).toBeNull()
    expect(valoresDoModelo('x')).toBeNull()
  })
})

describe('histórico e códigos', () => {
  it('ordena por dataEmissao desc, ignora canceladas e respeita o limite', () => {
    const ts = (ms: number) => ({ toMillis: () => ms })
    const notas = [
      { id: 'a', dataEmissao: ts(1000), status: 'emitida' },
      { id: 'b', dataEmissao: ts(3000), status: 'cancelada' },
      { id: 'c', dataEmissao: ts(2000), status: 'emitida' },
      { id: 'd', dataEmissao: { seconds: 4 }, status: 'emitida' },
    ]
    expect(notasParaCopia(notas).map((n) => n.id)).toEqual(['d', 'c', 'a'])
    expect(notasParaCopia(notas, 1).map((n) => n.id)).toEqual(['d'])
  })

  it('cTribNac ↔ item LC 116 e NBS', () => {
    expect(itemLc116DoCodigoNacional('010201')).toBe('1.02')
    expect(itemLc116DoCodigoNacional('171901')).toBe('17.19')
    expect(itemLc116DoCodigoNacional('12')).toBeUndefined()
    expect(codigoNacionalDerivado('1.02')).toBe('010201')
    expect(codigoNacionalDerivado('17.19.02')).toBe('171902')
    expect(formatarNbs('115011000')).toBe('1.1501.10.00')
    expect(nbsValido('1.1501.10.00')).toBe(true)
    expect(nbsValido('')).toBe(true)
    expect(nbsValido('1.1501.10')).toBe(false)
    expect(nbsValido('abc')).toBe(false)
  })
})
