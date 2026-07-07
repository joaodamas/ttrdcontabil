import { describe, expect, it } from 'vitest'
import {
  competenciaPodeTransicionar,
  opcoesStatusCompetencia,
  opcoesStatusTarefa,
  tarefaPodeTransicionar,
} from '@/lib/status-transitions'

describe('status-transitions — competência', () => {
  it('permite fluxo normal (aberta -> em_andamento -> concluida) para qualquer perfil', () => {
    expect(competenciaPodeTransicionar('aberta', 'em_andamento', 'operacional')).toBe(true)
    expect(competenciaPodeTransicionar('em_andamento', 'concluida', 'operacional')).toBe(true)
    expect(competenciaPodeTransicionar('aberta', 'cancelada', 'operacional')).toBe(true)
  })

  it('sempre permite manter o mesmo status (salvar outros campos)', () => {
    expect(competenciaPodeTransicionar('concluida', 'concluida', 'operacional')).toBe(true)
    expect(competenciaPodeTransicionar('cancelada', 'cancelada', 'operacional')).toBe(true)
  })

  it('bloqueia reabrir competência concluída para quem não é admin', () => {
    expect(competenciaPodeTransicionar('concluida', 'em_andamento', 'operacional')).toBe(false)
    expect(competenciaPodeTransicionar('concluida', 'aberta', 'fiscal')).toBe(false)
    expect(opcoesStatusCompetencia('concluida', 'operacional')).toEqual(['concluida'])
  })

  it('permite admin reabrir competência concluída', () => {
    expect(competenciaPodeTransicionar('concluida', 'em_andamento', 'admin')).toBe(true)
    expect(competenciaPodeTransicionar('concluida', 'aberta', 'admin')).toBe(true)
  })

  it('bloqueia ressuscitar competência cancelada para quem não é admin', () => {
    expect(competenciaPodeTransicionar('cancelada', 'aberta', 'operacional')).toBe(false)
  })

  it('permite admin ressuscitar competência cancelada, mas nunca direto para concluída', () => {
    expect(competenciaPodeTransicionar('cancelada', 'aberta', 'admin')).toBe(true)
    expect(competenciaPodeTransicionar('cancelada', 'em_andamento', 'admin')).toBe(true)
    expect(competenciaPodeTransicionar('cancelada', 'concluida', 'admin')).toBe(false)
  })
})

describe('status-transitions — tarefa', () => {
  it('permite fluxo normal para qualquer perfil', () => {
    expect(tarefaPodeTransicionar('pendente', 'em_andamento', { perfil: 'operacional' })).toBe(true)
    expect(tarefaPodeTransicionar('em_andamento', 'concluida', { perfil: 'operacional' })).toBe(true)
  })

  it('bloqueia reabrir tarefa concluída para quem não é admin nem responsável', () => {
    expect(tarefaPodeTransicionar('concluida', 'pendente', { perfil: 'operacional', isResponsavel: false })).toBe(false)
    expect(opcoesStatusTarefa('concluida', { perfil: 'operacional', isResponsavel: false })).toEqual(['concluida'])
  })

  it('permite o responsável atual reabrir a própria tarefa concluída', () => {
    expect(tarefaPodeTransicionar('concluida', 'pendente', { perfil: 'operacional', isResponsavel: true })).toBe(true)
  })

  it('permite admin reabrir/ressuscitar tarefa de qualquer responsável', () => {
    expect(tarefaPodeTransicionar('concluida', 'em_andamento', { perfil: 'admin', isResponsavel: false })).toBe(true)
    expect(tarefaPodeTransicionar('cancelada', 'pendente', { perfil: 'admin', isResponsavel: false })).toBe(true)
  })

  it('nunca permite ir de cancelada direto para concluida', () => {
    expect(tarefaPodeTransicionar('cancelada', 'concluida', { perfil: 'admin', isResponsavel: true })).toBe(false)
  })
})
