import { describe, expect, it } from 'vitest'
import { dateFromIsoLocal, isoDateLocal } from '@/lib/form-dates'

describe('isoDateLocal / dateFromIsoLocal — prazo não pula de dia por fuso', () => {
  it('usa o dia local, não o UTC (23h de um dia não vira o seguinte)', () => {
    const noite = new Date(2026, 10, 5, 23, 30)
    expect(isoDateLocal(noite)).toBe('2026-11-05')
  })

  it('ida e volta preserva a data', () => {
    expect(isoDateLocal(dateFromIsoLocal('2026-02-28'))).toBe('2026-02-28')
    expect(dateFromIsoLocal('2026-02-28').getHours()).toBe(12)
  })
})
