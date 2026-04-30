import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, getInitials, validateCnpj } from '@/lib/utils'

describe('utils', () => {
  it('formatCurrency formata em BRL', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56')
  })

  it('validateCnpj aceita válido e rejeita inválido', () => {
    expect(validateCnpj('11.222.333/0001-81')).toBe(true)
    expect(validateCnpj('11.222.333/0001-80')).toBe(false)
  })

  it('getInitials retorna iniciais', () => {
    expect(getInitials('João Silva')).toBe('JS')
  })

  it('formatDate formata data e trata null', () => {
    expect(formatDate(new Date('2026-01-15T00:00:00.000Z'))).toMatch(/15\/01\/2026|14\/01\/2026/)
    expect(formatDate(null)).toBe('—')
  })
})
