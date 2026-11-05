import { describe, expect, it } from 'vitest'
import { dataCompetenciaDps } from '../../functions/src/nfse/nacional/competencia'

describe('dataCompetenciaDps — competência da DPS nacional', () => {
  it('sem competência vinculada, usa a data de emissão', () => {
    expect(dataCompetenciaDps(undefined, '2026-11-05')).toBe('2026-11-05')
  })

  it('competência de mês anterior vira o 1º dia daquele mês', () => {
    expect(dataCompetenciaDps({ mes: 10, ano: 2026 }, '2026-11-05')).toBe('2026-10-01')
    expect(dataCompetenciaDps({ mes: 12, ano: 2025 }, '2026-01-10')).toBe('2025-12-01')
  })

  it('competência do mês corrente também usa o 1º dia', () => {
    expect(dataCompetenciaDps({ mes: 11, ano: 2026 }, '2026-11-05')).toBe('2026-11-01')
  })

  it('competência futura não passa da data de emissão (regra da Sefin)', () => {
    expect(dataCompetenciaDps({ mes: 12, ano: 2026 }, '2026-11-05')).toBe('2026-11-05')
  })

  it('data explícita (AAAA-MM-DD) tem prioridade, limitada à emissão', () => {
    expect(dataCompetenciaDps('2025-08-15', '2026-11-05')).toBe('2025-08-15')
    expect(dataCompetenciaDps('2027-01-01', '2026-11-05')).toBe('2026-11-05')
  })

  it('valor inválido cai na data de emissão', () => {
    expect(dataCompetenciaDps({ mes: 13, ano: 2026 }, '2026-11-05')).toBe('2026-11-05')
    expect(dataCompetenciaDps('15/08/2025', '2026-11-05')).toBe('2026-11-05')
  })
})
