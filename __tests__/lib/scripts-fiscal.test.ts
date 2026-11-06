// @vitest-environment node
/** Regras puras dos scripts de manutenção fiscal (sem tocar no Firestore). */
import { describe, expect, it } from 'vitest'

import { unificar } from '../../scripts/unificar-config-fiscal.mjs'
import { lerIdDps } from '../../scripts/recalcular-contador-dps.mjs'

const ts = (ms: number) => ({ toMillis: () => ms })

describe('unificar-config-fiscal', () => {
  it('base = mais recente; credenciais do doc com A1 atualizado por último; apaga os de auto-id', () => {
    const r = unificar('c1', [
      { id: 'velho', data: { clienteId: 'c1', tenantId: 't', aliquotaPadrao: 2, atualizadoEm: ts(100), credenciais: { certificadoStoragePath: 'certificados/c1.pfx.b64', certTitular: 'A', certVencimento: '2027' } } },
      { id: 'novo', data: { clienteId: 'c1', tenantId: 't', aliquotaPadrao: 5, atualizadoEm: ts(900) } },
      { id: 'meio', data: { clienteId: 'c1', tenantId: 't', atualizadoEm: ts(500), proximoNumeroDps: 30, numeracaoDpsAjuste: { serie: '1', tpAmb: '1' }, credenciais: { certificadoStoragePath: 'certificados/c1.pfx.b64', certTitular: 'B', certVencimento: '2028' } } },
    ])
    expect(r.base).toBe('novo')
    expect(r.dados.aliquotaPadrao).toBe(5)
    expect(r.credenciaisDe).toBe('meio')
    expect(r.dados.credenciais.certTitular).toBe('B')
    expect(r.dados.proximoNumeroDps).toBe(30)
    expect(r.apagar.sort()).toEqual(['meio', 'novo', 'velho'])
    expect(r.avisos[0]).toMatch(/certificados diferentes/)
  })

  it('doc canônico existente é a base e não é apagado', () => {
    const r = unificar('c1', [
      { id: 'c1', data: { clienteId: 'c1', tenantId: 't', atualizadoEm: ts(1) } },
      { id: 'auto', data: { clienteId: 'c1', tenantId: 't', atualizadoEm: ts(9) } },
    ])
    expect(r.base).toBe('c1')
    expect(r.apagar).toEqual(['auto'])
  })
})

describe('recalcular-contador-dps', () => {
  it('lê CNPJ, série e número do idDps', () => {
    expect(lerIdDps(`DPS3505708211222333000181${'00001'}${'7'.padStart(15, '0')}`)).toEqual({ cnpj: '11222333000181', serie: '1', numero: 7 })
    expect(lerIdDps(`35057081000${'12345678909'}00002${'42'.padStart(15, '0')}`)).toEqual({ cnpj: '12345678909', serie: '2', numero: 42 })
    expect(lerIdDps('qualquer')).toBeNull()
  })
})
