import { describe, expect, it } from 'vitest'

import { DIAS_ALERTA_VENCIMENTO, statusCertificado } from '@/lib/certificado-status'

const HOJE = new Date(2026, 10, 6, 10, 0, 0) // 06/11/2026
const emDias = (n: number) => new Date(2026, 10, 6 + n, 12).toISOString()
const CNPJ = '11222333000181'
const cred = (extra: Record<string, unknown> = {}) => ({
  certTitular: `PADARIA BOM GRAO LTDA:${CNPJ}`,
  certVencimento: emDias(200),
  certValido: true,
  certificadoStoragePath: 'certificados/cli-01.pfx',
  ...extra,
})

describe('statusCertificado', () => {
  it('sem titular nem arquivo = ausente', () => {
    expect(statusCertificado(undefined, CNPJ, HOJE).situacao).toBe('ausente')
    expect(statusCertificado({}, CNPJ, HOJE).situacao).toBe('ausente')
  })

  it('válido: titular, CNPJ do titular e dias até o vencimento', () => {
    const st = statusCertificado(cred(), CNPJ, HOJE)
    expect(st.situacao).toBe('valido')
    expect(st.cnpj).toBe(CNPJ)
    expect(st.titular).toContain('PADARIA')
    expect(st.diasRestantes).toBe(200)
    expect(st.outroCnpj).toBe(false)
  })

  it(`vence em ≤ ${DIAS_ALERTA_VENCIMENTO} dias = vencendo (inclusive hoje)`, () => {
    expect(statusCertificado(cred({ certVencimento: emDias(DIAS_ALERTA_VENCIMENTO) }), CNPJ, HOJE).situacao).toBe('vencendo')
    expect(statusCertificado(cred({ certVencimento: emDias(0) }), CNPJ, HOJE).situacao).toBe('vencendo')
    expect(statusCertificado(cred({ certVencimento: emDias(DIAS_ALERTA_VENCIMENTO + 1) }), CNPJ, HOJE).situacao).toBe('valido')
  })

  it('vencido (dias negativos)', () => {
    const st = statusCertificado(cred({ certVencimento: emDias(-3) }), CNPJ, HOJE)
    expect(st.situacao).toBe('vencido')
    expect(st.diasRestantes).toBe(-3)
  })

  it('certValido=false = inválido, mesmo dentro da validade', () => {
    expect(statusCertificado(cred({ certValido: false }), CNPJ, HOJE).situacao).toBe('invalido')
  })

  it('certificado de outro CNPJ é sinalizado', () => {
    expect(statusCertificado(cred(), '99888777000166', HOJE).outroCnpj).toBe(true)
    expect(statusCertificado(cred(), undefined, HOJE).outroCnpj).toBe(false)
  })

  it('vencimento ilegível não inventa data', () => {
    const st = statusCertificado(cred({ certVencimento: 'xx' }), CNPJ, HOJE)
    expect(st.vencimento).toBeUndefined()
    expect(st.situacao).toBe('valido')
  })
})
