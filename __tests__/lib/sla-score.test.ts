import { describe, expect, it } from 'vitest'
import { scoreSlaTarefa } from '@/lib/sla-score'

describe('sla-score', () => {
  const agora = new Date('2026-04-30T12:00:00.000Z')

  it('tarefa fiscal urgente atrasada 5 dias gera score alto', () => {
    const score = scoreSlaTarefa(
      {
        titulo: 'Obrigação fiscal mensal',
        prioridade: 'urgente',
        dataPrazo: new Date('2026-04-25T12:00:00.000Z'),
      },
      agora
    )
    expect(score).toBeGreaterThanOrEqual(100)
  })

  it('tarefa sem prazo usa score base', () => {
    const score = scoreSlaTarefa(
      { titulo: 'Revisar cadastro', prioridade: 'normal' },
      agora
    )
    expect(score).toBe(25)
  })

  it('ordena: fiscal urgente > financeiro alta > normal', () => {
    const fiscalUrgente = scoreSlaTarefa(
      { titulo: 'Pendência fiscal urgente', prioridade: 'urgente', dataPrazo: new Date('2026-04-29T12:00:00.000Z') },
      agora
    )
    const financeiroAlta = scoreSlaTarefa(
      { titulo: 'Cobrança financeiro', prioridade: 'alta', dataPrazo: new Date('2026-04-30T12:00:00.000Z') },
      agora
    )
    const normal = scoreSlaTarefa(
      { titulo: 'Organizar documentos', prioridade: 'normal', dataPrazo: new Date('2026-05-10T12:00:00.000Z') },
      agora
    )

    expect(fiscalUrgente).toBeGreaterThan(financeiroAlta)
    expect(financeiroAlta).toBeGreaterThan(normal)
  })
})
