// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  idSequenciaDps,
  normalizarSerieDps,
  pisoNumeracaoDps,
  podeReusarDps,
  proximoNumeroDps,
  ultimoAposColisao,
  validarProximoNumeroDps,
} from '../../functions/src/nfse/nacional/numeracao'
import { escolherDocConfigFiscal } from '../../functions/src/nfse/config-fiscal'
import { notaEncontradaEDestaNota } from '../../functions/src/nfse/reconciliacao'

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

describe('próximo número da DPS informado na config (cliente que já emitiu pelo Emissor Nacional)', () => {
  it('o piso vale quando o contador está atrás; o contador vence quando já passou', () => {
    expect(proximoNumeroDps(undefined, 51)).toBe(51)
    expect(proximoNumeroDps(10, 51)).toBe(51)
    expect(proximoNumeroDps(80, 51)).toBe(81)
    expect(proximoNumeroDps(3, undefined)).toBe(4)
    expect(proximoNumeroDps(3, 'x')).toBe(4)
  })

  it('o piso só vale para a mesma série e o mesmo ambiente do ajuste', () => {
    const config = { proximoNumeroDps: 51, numeracaoDpsAjuste: { serie: '1', tpAmb: '1' } }
    expect(pisoNumeracaoDps(config, '1', '1')).toBe(51)
    expect(pisoNumeracaoDps(config, '1', '2')).toBeUndefined()
    expect(pisoNumeracaoDps(config, '2', '1')).toBeUndefined()
    expect(pisoNumeracaoDps({ proximoNumeroDps: 51 }, '1', '1')).toBeUndefined()
    expect(pisoNumeracaoDps({}, '1', '1')).toBeUndefined()
  })

  it('só avança: nunca abaixo ou igual ao último já usado; inteiro de até 15 dígitos', () => {
    expect(validarProximoNumeroDps(51, 0)).toBeNull()
    expect(validarProximoNumeroDps(51, 50)).toBeNull()
    expect(validarProximoNumeroDps(50, 50)).toMatch(/51 ou maior/)
    expect(validarProximoNumeroDps(3, 50)).toMatch(/só avança/)
    expect(validarProximoNumeroDps(0, 0)).toMatch(/inteiro/)
    expect(validarProximoNumeroDps(1.5, 0)).toMatch(/inteiro/)
    expect(validarProximoNumeroDps('51', 0)).toMatch(/inteiro/)
    expect(validarProximoNumeroDps(1e16, 0)).toMatch(/15 dígitos/)
  })

  it('depois de uma colisão E0014 o contador fica pelo menos no número colidido', () => {
    expect(ultimoAposColisao(1, '7')).toBe(7)
    expect(ultimoAposColisao(9, '7')).toBe(9)
    expect(ultimoAposColisao(undefined, '1')).toBe(1)
    expect(ultimoAposColisao(4, 'RPS')).toBe(4)
  })
})

describe('uma configuração fiscal por cliente (leitura tolerante)', () => {
  const ts = (ms: number) => ({ toMillis: () => ms })
  it('o doc de id = clienteId vence, mesmo mais antigo', () => {
    const docs = [
      { id: 'auto1', data: { clienteId: 'c1', atualizadoEm: ts(300) } },
      { id: 'c1', data: { clienteId: 'c1', atualizadoEm: ts(100) } },
    ]
    expect(escolherDocConfigFiscal('c1', docs)?.id).toBe('c1')
  })

  it('sem o canônico: o mais recente por atualizadoEm, depois criadoEm, depois id (determinístico)', () => {
    const docs = [
      { id: 'b', data: { clienteId: 'c1', atualizadoEm: ts(100) } },
      { id: 'a', data: { clienteId: 'c1', atualizadoEm: ts(200) } },
      { id: 'z', data: { clienteId: 'c1' } },
    ]
    expect(escolherDocConfigFiscal('c1', docs)?.id).toBe('a')
    expect(escolherDocConfigFiscal('c1', [...docs].reverse())?.id).toBe('a')
    const empate = [
      { id: 'y', data: { clienteId: 'c1', criadoEm: ts(5) } },
      { id: 'x', data: { clienteId: 'c1', criadoEm: ts(5) } },
    ]
    expect(escolherDocConfigFiscal('c1', empate)?.id).toBe('x')
  })

  it('ignora doc de outro cliente e devolve null sem nenhum', () => {
    expect(escolherDocConfigFiscal('c1', [{ id: 'c1', data: { clienteId: 'c2' } }])).toBeNull()
    expect(escolherDocConfigFiscal('c1', [])).toBeNull()
  })
})

describe('nota encontrada pela série+número é desta nota?', () => {
  const input = {
    clienteId: 'c1',
    tomador: { razaoSocial: 'T', cpfCnpj: '11.444.777/0001-61' },
    servico: { discriminacao: 'x', codigoServico: '1719', valorServico: 1000, issRetido: false },
  }
  const xml = (doc: string, v: string) => `<NFSe><infNFSe><DPS><infDPS><toma><CNPJ>${doc}</CNPJ><xNome>T</xNome></toma><valores><vServPrest><vServ>${v}</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`
  it('mesmo tomador e valor = desta nota; outro tomador ou valor = outra nota', () => {
    expect(notaEncontradaEDestaNota(xml('11444777000161', '1000.00'), input)).toBe(true)
    expect(notaEncontradaEDestaNota(xml('99999999000191', '1000.00'), input)).toBe(false)
    expect(notaEncontradaEDestaNota(xml('11444777000161', '5.00'), input)).toBe(false)
  })
  it('sem XML ou sem os campos: não dá para afirmar', () => {
    expect(notaEncontradaEDestaNota(undefined, input)).toBeUndefined()
    expect(notaEncontradaEDestaNota('<NFSe><infNFSe/></NFSe>', input)).toBeUndefined()
  })
})
