// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RETENCAO_DIAS, dataDeExpiracao } from '../../functions/src/retencao'
import { montarAuditLog, SYSTEM_ACTOR } from '../../functions/src/audit'

const FOLGA_RELOGIO_DIAS = 30

describe('retenção (TTL do Firestore)', () => {
  it('prazos: auditoria cobre o decadencial do CTN (5 anos a partir do exercício seguinte); events 2 anos', () => {
    expect(RETENCAO_DIAS.logs_auditoria).toBeGreaterThanOrEqual(6 * 365)
    expect(RETENCAO_DIAS.nfse_eventos).toBeGreaterThanOrEqual(6 * 365)
    expect(RETENCAO_DIAS.events).toBeGreaterThanOrEqual(2 * 365)
  })

  it('dataDeExpiracao soma a retenção da coleção', () => {
    const agora = new Date('2026-11-06T00:00:00Z')
    const dias = (dataDeExpiracao('events', agora).getTime() - agora.getTime()) / 86_400_000
    expect(dias).toBe(RETENCAO_DIAS.events)
  })

  it('o mínimo aceito do navegador em firestore.rules acompanha a retenção (menos a folga de relógio)', () => {
    const regras = readFileSync('firestore.rules', 'utf8')
    const minimos = [...regras.matchAll(/expiraEmValido\(d, (\d+)\)/g)].map((m) => Number(m[1])).sort((a, b) => a - b)
    expect(minimos).toEqual([
      RETENCAO_DIAS.events - FOLGA_RELOGIO_DIAS,
      RETENCAO_DIAS.logs_auditoria - FOLGA_RELOGIO_DIAS,
    ].sort((a, b) => a - b))
  })

  it('log do servidor já nasce com expiraEm', () => {
    const log = montarAuditLog({ tenantId: 't', actor: SYSTEM_ACTOR, entidade: 'x', acao: 'y', origem: 'trigger' })
    const expira = (log.expiraEm as { toDate(): Date }).toDate()
    const dias = (expira.getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(RETENCAO_DIAS.logs_auditoria - 1)
  })
})
