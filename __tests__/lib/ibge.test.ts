import { describe, expect, it } from 'vitest'
import { normalizarIbge } from '@/lib/ibge'
import { IBGE_MAP, normalizarIbge as normalizarIbgeFunctions } from '../../functions/src/nfse/types'

describe('normalizarIbge — códigos antigos errados viram o município certo', () => {
  it('converte os dois códigos gravados errado', () => {
    for (const fn of [normalizarIbge, normalizarIbgeFunctions]) {
      expect(fn('3508900')).toBe('3509205') // Cajamar (3508900 é Caiabu)
      expect(fn('3552502')).toBe('3552809') // Taboão da Serra (3552502 é Suzano)
    }
  })

  it('mantém códigos corretos e trata vazio', () => {
    expect(normalizarIbge('3525904')).toBe('3525904')
    expect(normalizarIbge(undefined)).toBe('')
  })

  it('o mapa de municípios do backend usa só códigos corretos', () => {
    expect(IBGE_MAP['3509205']).toBe('Cajamar')
    expect(IBGE_MAP['3552809']).toBe('Taboão da Serra')
    expect(IBGE_MAP['3508900']).toBeUndefined()
    expect(IBGE_MAP['3552502']).toBeUndefined()
  })
})
