import { describe, expect, it } from 'vitest'
import { scoreCobranca } from '@/lib/financeiro-prioridade'

describe('financeiro-prioridade', () => {
  const agora = new Date('2026-04-30T12:00:00.000Z')

  it('atrasado 35 dias tem score >= 50', () => {
    const score = scoreCobranca(
      {
        tipo: 'receita',
        status: 'pendente',
        valor: 1200,
        dataVencimento: new Date('2026-03-26T12:00:00.000Z'),
      },
      agora
    )
    expect(score).toBeGreaterThanOrEqual(50)
  })

  it('vencendo hoje tem prioridade maior que vencendo em 7 dias', () => {
    const hoje = scoreCobranca(
      {
        tipo: 'receita',
        status: 'pendente',
        valor: 900,
        dataVencimento: new Date('2026-04-30T12:00:00.000Z'),
      },
      agora
    )
    const seteDias = scoreCobranca(
      {
        tipo: 'receita',
        status: 'pendente',
        valor: 900,
        dataVencimento: new Date('2026-05-07T12:00:00.000Z'),
      },
      agora
    )
    expect(hoje).toBeGreaterThan(seteDias)
  })
})
