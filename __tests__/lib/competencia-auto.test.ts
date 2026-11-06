import { describe, expect, it } from 'vitest'
import { decidirConclusaoAutomatica } from '../../functions/src/triggers/competencia-auto'
import { competenciaPodeTransicionar } from '@/lib/status-transitions'
import type { StatusCompetencia } from '@/types/firestore'

describe('decidirConclusaoAutomatica — trigger onTarefaConcluida respeita a matriz de transição', () => {
  it('conclui competência aberta ou em andamento', () => {
    expect(decidirConclusaoAutomatica({ existe: true, status: 'aberta' })).toEqual({ concluir: true })
    expect(decidirConclusaoAutomatica({ existe: true, status: 'em_andamento' })).toEqual({ concluir: true })
  })

  it('cancelada nunca vai direto para concluída', () => {
    expect(decidirConclusaoAutomatica({ existe: true, status: 'cancelada' }))
      .toEqual({ concluir: false, motivo: 'transicao_invalida' })
  })

  it('já concluída: nada a fazer (não regrava a data de conclusão)', () => {
    expect(decidirConclusaoAutomatica({ existe: true, status: 'concluida' }))
      .toEqual({ concluir: false, motivo: 'ja_concluida' })
  })

  it('competência apagada não é recriada', () => {
    expect(decidirConclusaoAutomatica({ existe: false }))
      .toEqual({ concluir: false, motivo: 'competencia_inexistente' })
  })

  it('status desconhecido não conclui', () => {
    expect(decidirConclusaoAutomatica({ existe: true, status: 'arquivada' }).concluir).toBe(false)
  })

  it('bate com a matriz do front para um usuário sem perfil admin', () => {
    const estados: StatusCompetencia[] = ['aberta', 'em_andamento', 'concluida', 'cancelada']
    for (const de of estados) {
      if (de === 'concluida') continue // no-op, não é transição
      expect(decidirConclusaoAutomatica({ existe: true, status: de }).concluir)
        .toBe(competenciaPodeTransicionar(de, 'concluida', 'operacional'))
    }
  })
})
