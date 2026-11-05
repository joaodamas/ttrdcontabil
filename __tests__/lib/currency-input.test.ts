import { describe, it, expect } from 'vitest'
import { formatBRL, parseBRL, sanitizeBRLInput } from '@/lib/currency-input'

describe('formatBRL', () => {
  it('formata com milhar e 2 casas', () => {
    expect(formatBRL(1234.56)).toBe('1.234,56')
    expect(formatBRL(1000000)).toBe('1.000.000,00')
    expect(formatBRL(0)).toBe('0,00')
    expect(formatBRL(0.5)).toBe('0,50')
  })

  it('retorna vazio para null/undefined/NaN', () => {
    expect(formatBRL(null)).toBe('')
    expect(formatBRL(undefined)).toBe('')
    expect(formatBRL(NaN)).toBe('')
  })
})

describe('parseBRL', () => {
  it('lê vírgula como decimal e ponto como milhar', () => {
    expect(parseBRL('1.234,56')).toBe(1234.56)
    expect(parseBRL('1234,5')).toBe(1234.5)
    expect(parseBRL('1.000.000')).toBe(1000000)
    expect(parseBRL('10,')).toBe(10)
  })

  it('aceita ponto decimal quando não há vírgula e 1–2 casas', () => {
    expect(parseBRL('1234.56')).toBe(1234.56)
    expect(parseBRL('0.5')).toBe(0.5)
    expect(parseBRL('1.234')).toBe(1234)
  })

  it('ignora prefixo R$ e espaços', () => {
    expect(parseBRL('R$ 1.234,56')).toBe(1234.56)
  })

  it('arredonda para 2 casas', () => {
    expect(parseBRL('0,999')).toBe(1)
  })

  it('retorna null para vazio ou inválido', () => {
    expect(parseBRL('')).toBeNull()
    expect(parseBRL(null)).toBeNull()
    expect(parseBRL(',')).toBeNull()
    expect(parseBRL('abc')).toBeNull()
    expect(parseBRL('1,2,3')).toBeNull()
  })

  it('é inverso de formatBRL', () => {
    for (const n of [0, 0.01, 12.3, 1234.56, 987654.32]) {
      expect(parseBRL(formatBRL(n))).toBe(n)
    }
  })
})

describe('sanitizeBRLInput', () => {
  it('remove caracteres não numéricos', () => {
    expect(sanitizeBRLInput('R$ 12a,3')).toBe('12,3')
  })

  it('mantém uma só vírgula e no máximo 2 casas', () => {
    expect(sanitizeBRLInput('1,234,5')).toBe('1,23')
    expect(sanitizeBRLInput('10,999')).toBe('10,99')
  })

  it('preserva pontos de milhar na parte inteira', () => {
    expect(sanitizeBRLInput('1.234,5')).toBe('1.234,5')
  })
})
