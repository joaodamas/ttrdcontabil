import { describe, expect, it } from 'vitest'
import {
  decidirTravaEmissao,
  validarChaveIdempotencia,
} from '../../functions/src/nfse/idempotencia'

describe('validarChaveIdempotencia — chave vira integrationId da Spedy (máx. 36)', () => {
  it('aceita um UUID gerado pelo navegador', () => {
    expect(validarChaveIdempotencia('3f2b8c1e-9a4d-4b7e-8f21-0c6d5e4a3b2f')).toBe(true)
  })

  it('recusa ausente, vazia, longa demais ou com caracteres fora do padrão', () => {
    expect(validarChaveIdempotencia(undefined)).toBe(false)
    expect(validarChaveIdempotencia('')).toBe(false)
    expect(validarChaveIdempotencia('a'.repeat(37))).toBe(false)
    expect(validarChaveIdempotencia('../outro/doc')).toBe(false)
    expect(validarChaveIdempotencia('curta')).toBe(false)
  })
})

describe('decidirTravaEmissao — duplo clique e retry não emitem duas notas', () => {
  const agora = Date.parse('2026-11-05T12:00:00Z')

  it('primeira tentativa segue para a emissão', () => {
    expect(decidirTravaEmissao(null, agora)).toEqual({ acao: 'emitir' })
  })

  it('nota já emitida com a chave devolve o resultado anterior, sem reenviar', () => {
    const trava = { status: 'emitida' as const, notaId: 'n1', numeroNfse: '123', atualizadoEmMs: agora - 1000 }
    expect(decidirTravaEmissao(trava, agora)).toEqual({ acao: 'reaproveitar', notaId: 'n1', numeroNfse: '123' })
  })

  it('emissão em andamento recente bloqueia a segunda chamada', () => {
    const trava = { status: 'processando' as const, atualizadoEmMs: agora - 30_000 }
    expect(decidirTravaEmissao(trava, agora)).toEqual({ acao: 'bloquear' })
  })

  it('processando antigo (função morreu) libera — a Spedy deduplica pelo integrationId', () => {
    const trava = { status: 'processando' as const, atualizadoEmMs: agora - 4 * 60_000 }
    expect(decidirTravaEmissao(trava, agora)).toEqual({ acao: 'emitir' })
  })

  it('tentativa anterior com erro libera o retry com a mesma chave', () => {
    const trava = { status: 'erro' as const, atualizadoEmMs: agora - 1000 }
    expect(decidirTravaEmissao(trava, agora)).toEqual({ acao: 'emitir' })
  })
})
