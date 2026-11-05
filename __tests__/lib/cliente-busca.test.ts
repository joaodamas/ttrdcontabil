import { describe, expect, it } from 'vitest'
import { filtrarCliente, termosBuscaCliente } from '@/lib/cliente-busca'

describe('termosBuscaCliente — busca do seletor de cliente', () => {
  const c = { id: 'abc', razaoSocial: 'RENATO PIZZA BUFFET LTDA', nomeFantasia: 'Renato Pizza', cpfCnpj: '12.345.678/0001-90' }

  it('indexa razão social, nome fantasia e o documento com e sem pontuação', () => {
    const t = termosBuscaCliente(c)
    expect(t).toContain('RENATO PIZZA BUFFET LTDA')
    expect(t).toContain('Renato Pizza')
    expect(t).toContain('12.345.678/0001-90')
    expect(t).toContain('12345678000190')
  })

  it('homônimos ficam distintos pelo id', () => {
    expect(termosBuscaCliente(c)).not.toBe(termosBuscaCliente({ ...c, id: 'outro' }))
  })

  it('aguenta cliente sem documento nem fantasia', () => {
    expect(termosBuscaCliente({ id: 'x', razaoSocial: 'ACME' })).toBe('ACME #x')
  })
})

describe('filtrarCliente — filtro do cmdk', () => {
  const v = termosBuscaCliente({ id: 'c1', razaoSocial: 'Clínica Sorriso Pleno Ltda', nomeFantasia: 'Sorriso', cpfCnpj: '11222333001361' })

  it('CNPJ com ou sem pontuação, inteiro ou parcial', () => {
    expect(filtrarCliente(v, '11.222.333/0013')).toBe(1)
    expect(filtrarCliente(v, '11222333')).toBe(1)
    expect(filtrarCliente(v, '11.222.333/0013-61')).toBe(1)
    expect(filtrarCliente(v, '99.888')).toBe(0)
  })

  it('ignora acentos e caixa, e aceita palavras fora de ordem', () => {
    expect(filtrarCliente(v, 'clinica')).toBe(1)
    expect(filtrarCliente(v, 'PLENO sorriso')).toBe(1)
    expect(filtrarCliente(v, 'padaria')).toBe(0)
  })

  it('o id interno não casa com a busca', () => {
    const comId = termosBuscaCliente({ id: 'k9x8765', razaoSocial: 'Padaria Bom Grão' })
    expect(filtrarCliente(comId, '8765')).toBe(0)
    expect(filtrarCliente(comId, 'k9x')).toBe(0)
  })

  it('busca vazia mostra tudo', () => {
    expect(filtrarCliente(v, '  ')).toBe(1)
  })
})
