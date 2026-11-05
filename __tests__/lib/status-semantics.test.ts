import { describe, expect, it } from 'vitest'
import { getStatusInfo, getStatusKeys, getStatusLabel } from '@/lib/status-semantics'

describe('status-semantics', () => {
  it('"Emitida" é sempre success', () => {
    expect(getStatusInfo('nfse', 'emitida')).toEqual({ label: 'Emitida', tone: 'success' })
  })

  it('"Concluída" é success para tarefa e competência', () => {
    expect(getStatusInfo('tarefa', 'concluida').tone).toBe('success')
    expect(getStatusInfo('competencia', 'concluida').tone).toBe('success')
  })

  it('"Pendente" tem o mesmo tom em todas as entidades', () => {
    const tons = [
      getStatusInfo('tarefa', 'pendente').tone,
      getStatusInfo('pagamento', 'pendente').tone,
      getStatusInfo('ir', 'pendente').tone,
      getStatusInfo('nfse', 'pendente_processamento').tone,
    ]
    expect(new Set(tons)).toEqual(new Set(['warning']))
  })

  it('"Em andamento" é info em todas as entidades', () => {
    for (const entity of ['tarefa', 'competencia', 'ir'] as const) {
      expect(getStatusInfo(entity, 'em_andamento').tone).toBe('info')
    }
  })

  it('erros e atrasos são destructive', () => {
    expect(getStatusInfo('nfse', 'rejeitada').tone).toBe('destructive')
    expect(getStatusInfo('nfse', 'erro_integracao').tone).toBe('destructive')
    expect(getStatusInfo('pagamento', 'atrasado').tone).toBe('destructive')
    expect(getStatusInfo('tarefaPrioridade', 'urgente').tone).toBe('destructive')
  })

  it('cancelamentos são neutral, nunca destructive', () => {
    expect(getStatusInfo('tarefa', 'cancelada').tone).toBe('neutral')
    expect(getStatusInfo('competencia', 'cancelada').tone).toBe('neutral')
    expect(getStatusInfo('nfse', 'cancelada').tone).toBe('neutral')
    expect(getStatusInfo('pagamento', 'cancelado').tone).toBe('neutral')
  })

  it('valor desconhecido devolve o próprio valor com tom outline', () => {
    expect(getStatusInfo('tarefa', 'xyz')).toEqual({ label: 'xyz', tone: 'outline' })
    expect(getStatusInfo('tarefa', undefined)).toEqual({ label: '—', tone: 'outline' })
  })

  it('getStatusLabel e getStatusKeys', () => {
    expect(getStatusLabel('ir', 'entregue')).toBe('Entregue')
    expect(getStatusKeys('competencia')).toEqual(['aberta', 'em_andamento', 'concluida', 'cancelada'])
  })
})
