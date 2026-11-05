// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  ErroMapeamentoNacional,
  mapearCodigoTributacaoNacional,
  mapearRegime,
  mapearTomador,
  mapearTpRetIssqn,
  mapearTribIssqn,
  montarDadosNotaNacional,
  nomeMunicipio,
} from '../../functions/src/nfse/nacional/mapeamento'
import { montarDpsXml, validarDadosNota } from '../../functions/src/nfse/nacional/dps'
import { conectorLiberaProducao, resolverProvedorNfse } from '../../functions/src/nfse/provedor'
import type { ConfigFiscalCliente, EmitirNfseInput, Prestador } from '../../functions/src/nfse/types'

function config(over: Partial<ConfigFiscalCliente> = {}): ConfigFiscalCliente {
  return {
    clienteId: 'c1',
    municipioEmissor: 'Barueri',
    municipioIbge: '3505708',
    inscricaoMunicipal: '12.345',
    regimeTributario: 'simples_nacional',
    optanteSimples: true,
    incentivadorCultural: false,
    itemListaServico: '17.19',
    aliquotaPadrao: 2,
    ambienteEmissao: 'homologacao',
    ...over,
  }
}

const prestador: Prestador = { cnpj: '11222333000181', inscricaoMunicipal: '12345', razaoSocial: 'Prestador', municipioIbge: '3505708' }

function input(over: Partial<EmitirNfseInput['servico']> = {}, tomador?: EmitirNfseInput['tomador']): EmitirNfseInput {
  return {
    clienteId: 'c1',
    tomador: tomador ?? { cpfCnpj: '11444777000161', razaoSocial: 'Tomador Ltda' },
    servico: { discriminacao: 'Serviços contábeis', codigoServico: '1719', valorServico: 1000, issRetido: false, ...over },
    numeroRps: '1',
    serieRps: '1',
  }
}

const DPS = { serie: '1', numero: '7', competencia: '2026-11-05' }

describe('regime → regTrib', () => {
  it('MEI = 2 sem regApTribSN', () => {
    expect(mapearRegime({ regimeTributario: 'mei', optanteSimples: true })).toEqual({ opSimpNac: 2, regEspTrib: 0 })
  })
  it('Simples (ou optante) = 3 com regApTribSN 1', () => {
    expect(mapearRegime({ regimeTributario: 'simples_nacional', optanteSimples: false })).toEqual({ opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 })
    expect(mapearRegime({ regimeTributario: 'lucro_presumido', optanteSimples: true }).opSimpNac).toBe(3)
  })
  it.each(['lucro_presumido', 'lucro_real', 'isento'] as const)('%s não optante = 1', (r) => {
    expect(mapearRegime({ regimeTributario: r, optanteSimples: false })).toEqual({ opSimpNac: 1, regEspTrib: 0 })
  })
})

describe('LC 116 → cTribNac', () => {
  it.each([
    ['17.19', '171901'],
    ['1.07', '010701'],
    ['01.07', '010701'],
    ['17.19.02', '171902'],
    ['171901', '171901'],
    ['1719', '171901'],
    ['107', '010701'],
    [' 7.02 ', '070201'],
  ])('%s → %s', (item, esperado) => {
    expect(mapearCodigoTributacaoNacional(item)).toBe(esperado)
  })
  it('override de 6 dígitos tem precedência', () => {
    expect(mapearCodigoTributacaoNacional('17.19', '17.19.03')).toBe('171903')
    expect(() => mapearCodigoTributacaoNacional('17.19', '1719')).toThrow(/6 dígitos/)
  })
  it.each(['', 'abc', '17', '00.01', '17.00', '12345'])('recusa "%s"', (item) => {
    expect(() => mapearCodigoTributacaoNacional(item)).toThrow(ErroMapeamentoNacional)
  })
})

describe('ISSQN', () => {
  it('ISS retido → tpRetISSQN 2, senão 1', () => {
    expect(mapearTpRetIssqn(true)).toBe(2)
    expect(mapearTpRetIssqn(false)).toBe(1)
    expect(mapearTpRetIssqn(undefined)).toBe(1)
  })
  it('natureza: tributável/fora = 1, imune = 2, isenção/suspensão recusadas', () => {
    expect(mapearTribIssqn(undefined)).toBe(1)
    expect(mapearTribIssqn('2')).toBe(1)
    expect(mapearTribIssqn('4')).toBe(2)
    expect(() => mapearTribIssqn('3')).toThrow(/Isenção/)
  })
})

describe('tomador', () => {
  it('CPF ou CNPJ pelo tamanho; endereço só se completo', () => {
    expect(mapearTomador({ cpfCnpj: '123.456.789-09', razaoSocial: 'Pessoa' })?.cpfCnpj).toBe('12345678909')
    const parcial = mapearTomador({ cpfCnpj: '11444777000161', razaoSocial: 'X', endereco: { cep: '06400000', logradouro: 'Rua' } })
    expect(parcial?.endereco).toBeUndefined()
    const completo = mapearTomador({
      cpfCnpj: '11444777000161', razaoSocial: 'X',
      endereco: { cep: '06400-000', municipioIbge: '3552502', logradouro: 'Rua A', numero: '1', bairro: 'Centro' },
    })
    // IBGE legado (Suzano gravado como Taboão) é corrigido
    expect(completo?.endereco).toMatchObject({ cep: '06400000', municipioIbge: '3552809' })
    expect(() => mapearTomador({ cpfCnpj: '123', razaoSocial: 'X' })).toThrow(/CPF\/CNPJ/)
  })
})

describe('montarDadosNotaNacional', () => {
  it('ME/EPP sem retenção: sem pAliq, pTotTribSN pela alíquota padrão, IM só dígitos', () => {
    const d = montarDadosNotaNacional(input(), config(), prestador, DPS)
    expect(validarDadosNota(d)).toEqual([])
    expect(d.prestador).toMatchObject({ cnpj: '11222333000181', inscricaoMunicipal: '12345', regime: { opSimpNac: 3 } })
    expect(d.servico.cTribNac).toBe('171901')
    expect(d.valores).toMatchObject({ tribISSQN: 1, tpRetISSQN: 1, totTrib: { pTotTribSN: 2 } })
    expect(d.valores.aliquotaIss).toBeUndefined()
    expect(d.servico.municipioPrestacao).toBe('3505708')
  })

  it('ME/EPP com ISS retido leva pAliq; alíquota do Simples tem precedência no pTotTribSN', () => {
    const d = montarDadosNotaNacional(input({ issRetido: true, aliquota: 3 }), config({ aliquotaSimplesNacional: 6 }), prestador, DPS)
    expect(d.valores).toMatchObject({ tpRetISSQN: 2, aliquotaIss: 3, totTrib: { pTotTribSN: 6 } })
  })

  it('não optante: indTotTrib 0, sem pAliq; retenções federais entram', () => {
    const d = montarDadosNotaNacional(
      input({ valorIr: 15, valorCsll: 10, valorInss: 0 }),
      config({ regimeTributario: 'lucro_presumido', optanteSimples: false }),
      prestador, DPS,
    )
    expect(d.valores).toMatchObject({ totTrib: { indTotTrib: 0 }, retencaoIrrf: 15, retencaoCsll: 10 })
    expect(d.valores.retencaoCp).toBeUndefined()
    expect(d.valores.aliquotaIss).toBeUndefined()
  })

  it('MEI não leva retenções federais', () => {
    const d = montarDadosNotaNacional(input({ valorIr: 15 }), config({ regimeTributario: 'mei' }), prestador, DPS)
    expect(d.prestador.regime).toEqual({ opSimpNac: 2, regEspTrib: 0 })
    expect(d.valores.retencaoIrrf).toBeUndefined()
    expect(validarDadosNota(d)).toEqual([])
  })

  it('cTribMun e override de cTribNac vêm da config', () => {
    const d = montarDadosNotaNacional(input(), config({ codigoTributacaoNacional: '010701', codigoTributacaoMunicipal: '1' }), prestador, DPS)
    expect(d.servico).toMatchObject({ cTribNac: '010701', cTribMun: '001' })
  })

  it('recusa o que o leiaute nacional da plataforma ainda não cobre', () => {
    expect(() => montarDadosNotaNacional(input({ valorDeducoes: 10 }), config(), prestador, DPS)).toThrow(/Deduções/)
    expect(() => montarDadosNotaNacional(input({ outrasRetencoes: 1 }), config(), prestador, DPS)).toThrow(/Outras retenções/)
    expect(() => montarDadosNotaNacional(input({ valorPis: 1 }), config({ optanteSimples: false, regimeTributario: 'lucro_real' }), prestador, DPS)).toThrow(/CST/)
    expect(() => montarDadosNotaNacional(input({ issRetido: true }), config({ aliquotaPadrao: undefined }), prestador, DPS)).toThrow(ErroMapeamentoNacional)
  })

  it('o resultado monta uma DPS válida em cada ambiente', () => {
    const d = montarDadosNotaNacional(input(), config(), prestador, DPS)
    expect(montarDpsXml(d, { dhEmi: '2026-11-05T10:00:00-03:00', ambiente: 'producao' }).xml).toContain('<tpAmb>1</tpAmb>')
    expect(montarDpsXml(d, { dhEmi: '2026-11-05T10:00:00-03:00', ambiente: 'homologacao' }).xml).toContain('<tpAmb>2</tpAmb>')
  })

  it('nome do município para as mensagens', () => {
    expect(nomeMunicipio('3508900')).toBe('Cajamar')
    expect(nomeMunicipio('3500105', { municipioIbge: '3500105', municipioEmissor: 'Adamantina' })).toBe('Adamantina')
    expect(nomeMunicipio('3500105')).toBe('o município 3500105')
  })
})

describe('provedor', () => {
  it('sem provedor = nacional; municipio e spedy só explícitos', () => {
    expect(resolverProvedorNfse({})).toBe('nacional')
    expect(resolverProvedorNfse(undefined)).toBe('nacional')
    // 'municipio' era gravado à força pelo formulário antigo — não foi escolha: vai pelo Nacional.
    expect(resolverProvedorNfse({ provedorNfse: 'municipio' })).toBe('nacional')
    expect(resolverProvedorNfse({ provedorNfse: 'nacional' })).toBe('nacional')
    // Só a escolha explícita do legado usa o conector da prefeitura.
    expect(resolverProvedorNfse({ provedorNfse: 'prefeitura' })).toBe('municipio')
    expect(resolverProvedorNfse({ provedorNfse: 'spedy' })).toBe('spedy')
  })

  it('homologar o conector da prefeitura não libera o nacional (e vice-versa)', () => {
    const liberado = { ativo: true, homologado: true, producaoLiberada: true, emissao: true }
    expect(conectorLiberaProducao(liberado, 'emissao', 'municipio')).toBe(true)
    expect(conectorLiberaProducao(liberado, 'emissao', 'nacional')).toBe(false)
    expect(conectorLiberaProducao({ ...liberado, provedor: 'nacional' }, 'emissao', 'nacional')).toBe(true)
    expect(conectorLiberaProducao({ ...liberado, provedor: 'nacional' }, 'cancelamento', 'nacional')).toBe(false)
    expect(conectorLiberaProducao({ ...liberado, provedor: 'nacional', homologado: false }, 'emissao', 'nacional')).toBe(false)
  })
})
