// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  idSequenciaDps,
  normalizarSerieDps,
  podeReusarDps,
  proximoNumeroDps,
} from '../../functions/src/nfse/nacional/numeracao'

describe('numeração da DPS', () => {
  it('série padrão 1; aceita o padrão do XSD e tira zeros à esquerda', () => {
    expect(normalizarSerieDps(undefined)).toBe('1')
    expect(normalizarSerieDps('  ')).toBe('1')
    expect(normalizarSerieDps('900')).toBe('900')
    expect(normalizarSerieDps('00007')).toBe('7')
    expect(() => normalizarSerieDps('RPS')).toThrow(/Série/)
    expect(() => normalizarSerieDps('90000')).toThrow(/Série/)
  })

  it('chave do contador separa CNPJ, ambiente e série', () => {
    expect(idSequenciaDps('11.222.333/0001-81', '2', '1')).toBe('11222333000181_2_1')
    expect(idSequenciaDps('11222333000181', '1', '1')).not.toBe(idSequenciaDps('11222333000181', '2', '1'))
    expect(() => idSequenciaDps('123', '1', '1')).toThrow(/CNPJ/)
    expect(() => idSequenciaDps('11222333000181', '3' as '1', '1')).toThrow(/tpAmb/)
  })

  it('próximo número começa em 1 e incrementa', () => {
    expect(proximoNumeroDps(undefined)).toBe(1)
    expect(proximoNumeroDps(-4)).toBe(1)
    expect(proximoNumeroDps('9')).toBe(1)
    expect(proximoNumeroDps(41)).toBe(42)
    expect(() => proximoNumeroDps(999_999_999_999_999)).toThrow(/esgotada/)
  })

  it('reusa só DPS nacional do mesmo ambiente (retry); RPS municipal antigo ganha número novo', () => {
    const dps = { numero: '42', serie: '1', provedor: 'nacional', tpAmb: '2' }
    expect(podeReusarDps(dps, { tpAmb: '2' })).toBe(true)
    expect(podeReusarDps(dps, { tpAmb: '1' })).toBe(false)
    expect(podeReusarDps({ numero: '12345678', serie: 'RPS' }, { tpAmb: '2' })).toBe(false)
    expect(podeReusarDps({ ...dps, provedor: undefined }, { tpAmb: '2' })).toBe(false)
    expect(podeReusarDps({ ...dps, numero: '042' }, { tpAmb: '2' })).toBe(false)
  })
})
