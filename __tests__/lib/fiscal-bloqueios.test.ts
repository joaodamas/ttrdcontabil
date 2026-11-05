import { describe, expect, it } from 'vitest'
import { BLOQUEIO_FISCAL, resumirBloqueios } from '@/lib/fiscal-bloqueios'

describe('fiscal-bloqueios', () => {
  it('mensagens começam com maiúscula e não usam o jargão "ausente"', () => {
    for (const msg of Object.values(BLOQUEIO_FISCAL)) {
      expect(msg[0]).toBe(msg[0].toUpperCase())
      expect(msg).not.toMatch(/ausente/i)
    }
  })

  it('resumirBloqueios mostra até 3 e conta o restante', () => {
    expect(resumirBloqueios([])).toBe('Sem bloqueios')
    expect(resumirBloqueios(['A', 'B'])).toBe('A · B')
    expect(resumirBloqueios(['A', 'B', 'C', 'D', 'E'])).toBe('A · B · C · +2')
  })
})
