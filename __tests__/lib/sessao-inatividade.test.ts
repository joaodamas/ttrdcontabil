import { describe, expect, it } from 'vitest'

import {
  AVISO_ANTES_MS,
  LIMITE_INATIVIDADE_MS,
  estadoInatividade,
  lerUltimaAtividade,
} from '@/lib/sessao-inatividade'
import { perfilComSegurancaReforcada } from '@/lib/mfa'

describe('logout por inatividade', () => {
  const agora = 10_000_000_000

  it('30 min: ativo → aviso no último minuto → expirado', () => {
    expect(LIMITE_INATIVIDADE_MS).toBe(30 * 60_000)
    expect(estadoInatividade(agora, agora - 5 * 60_000)).toBe('ativo')
    expect(estadoInatividade(agora, agora - (LIMITE_INATIVIDADE_MS - AVISO_ANTES_MS))).toBe('aviso')
    expect(estadoInatividade(agora, agora - LIMITE_INATIVIDADE_MS)).toBe('expirado')
    expect(estadoInatividade(agora, agora - 3 * 60 * 60_000)).toBe('expirado')
  })

  it('valor gravado inválido ou no futuro conta como agora (não desloga por lixo no storage)', () => {
    expect(lerUltimaAtividade(null, agora)).toBe(agora)
    expect(lerUltimaAtividade('abc', agora)).toBe(agora)
    expect(lerUltimaAtividade(String(agora + 10 * 60_000), agora)).toBe(agora)
    expect(lerUltimaAtividade(String(agora - 1000), agora)).toBe(agora - 1000)
  })

  it('vale para administrador e fiscal', () => {
    expect(perfilComSegurancaReforcada('admin')).toBe(true)
    expect(perfilComSegurancaReforcada('fiscal')).toBe(true)
    for (const p of ['operacional', 'financeiro', 'leitura', undefined, null]) {
      expect(perfilComSegurancaReforcada(p)).toBe(false)
    }
  })
})
