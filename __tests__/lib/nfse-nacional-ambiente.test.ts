// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  AmbienteProibidoError,
  BASES_SEFIN,
  BASE_ADN,
  assertUrlProducaoRestrita,
  assertXmlHomologacao,
  compactarXml,
  descompactarXml,
  extrairMensagens,
  formatarMensagem,
  montarUrl,
} from '../../scripts/poc-nfse-nacional/lib/ambiente'

describe('trava de produção restrita', () => {
  it.each([
    'https://sefin.nfse.gov.br/SefinNacional/nfse',
    'https://adn.nfse.gov.br/parametrizacao/3525904/convenio',
    'https://SEFIN.NFSE.GOV.BR/SefinNacional/nfse',
    'https://sefin.nfse.gov.br./SefinNacional/nfse',
  ])('recusa produção: %s', (url) => {
    expect(() => assertUrlProducaoRestrita(url)).toThrow(/PRODUÇÃO/)
  })

  it.each([
    'https://example.com/nfse',
    'https://sefin.producaorestrita.nfse.gov.br.evil.com/nfse',
    'https://evil.com/?h=sefin.producaorestrita.nfse.gov.br',
    'http://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse',
    'https://sefin.producaorestrita.nfse.gov.br:8443/nfse',
    'https://user:pw@sefin.producaorestrita.nfse.gov.br/nfse',
    'não é url',
  ])('recusa fora da allowlist: %s', (url) => {
    expect(() => assertUrlProducaoRestrita(url)).toThrow(AmbienteProibidoError)
  })

  it('aceita só os dois hosts da produção restrita', () => {
    expect(assertUrlProducaoRestrita(`${BASES_SEFIN.api}/nfse`).hostname).toBe('sefin.producaorestrita.nfse.gov.br')
    expect(assertUrlProducaoRestrita(`${BASES_SEFIN.raiz}/nfse`).hostname).toBe('sefin.producaorestrita.nfse.gov.br')
    expect(assertUrlProducaoRestrita(`${BASE_ADN}/danfse/x`).hostname).toBe('adn.producaorestrita.nfse.gov.br')
  })

  it('montarUrl codifica segmentos e mantém o host travado', () => {
    expect(montarUrl(BASES_SEFIN.api, 'nfse', 'a/b?c').href).toBe(
      'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse/a%2Fb%3Fc',
    )
    expect(montarUrl(BASE_ADN, '..', '..', 'x').hostname).toBe('adn.producaorestrita.nfse.gov.br')
    expect(() => montarUrl('https://sefin.nfse.gov.br/SefinNacional', 'nfse')).toThrow(/PRODUÇÃO/)
  })

  it('XML só sai com tpAmb = 2', () => {
    expect(() => assertXmlHomologacao('<DPS><infDPS><tpAmb>2</tpAmb></infDPS></DPS>')).not.toThrow()
    expect(() => assertXmlHomologacao('<DPS><infDPS><tpAmb>1</tpAmb></infDPS></DPS>')).toThrow(/tpAmb/)
    expect(() => assertXmlHomologacao('<DPS><infDPS></infDPS></DPS>')).toThrow(/sem <tpAmb>/)
    expect(() => assertXmlHomologacao('<a><tpAmb>2</tpAmb><tpAmb> 1 </tpAmb></a>')).toThrow()
  })
})

describe('empacotamento gzip + base64', () => {
  it('ida e volta preserva o XML (UTF-8)', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><DPS>Serviço çã</DPS>'
    const b64 = compactarXml(xml)
    expect(Buffer.from(b64, 'base64').subarray(0, 2).toString('hex')).toBe('1f8b') // cabeçalho gzip
    expect(descompactarXml(b64)).toBe(xml)
  })
})

describe('mensagens de erro da Sefin', () => {
  it('aceita erros/erro, objeto único e maiúsculas', () => {
    expect(extrairMensagens({ erros: [{ Codigo: 'E0312', Descricao: 'Código de tributação municipal' }] }).erros).toEqual([
      { codigo: 'E0312', descricao: 'Código de tributação municipal', complemento: undefined },
    ])
    const um = extrairMensagens({ erro: { codigo: 'E1235', descricao: 'Falha no esquema', complemento: 'linha 1' } })
    expect(formatarMensagem(um.erros[0])).toBe('[E1235] Falha no esquema — linha 1')
    expect(extrairMensagens({ alertas: [{ mensagem: 'aviso' }] }).alertas[0].descricao).toBe('aviso')
    expect(extrairMensagens(null)).toEqual({ erros: [], alertas: [] })
  })
})
