import { describe, expect, it } from 'vitest'
import { situacaoNacional } from '@/lib/nfse-nacional-convenio'

describe('situacaoNacional — mapa de convênios da produção', () => {
  it('municípios que emitem pelo Nacional', () => {
    expect(situacaoNacional('3550308')).toBe('emissor') // São Paulo
    expect(situacaoNacional('3509205')).toBe('emissor') // Cajamar
    expect(situacaoNacional('3505708')).toBe('emissor') // Barueri
  })
  it('municípios que emitem no sistema da prefeitura', () => {
    expect(situacaoNacional('3509502')).toBe('prefeitura') // Campinas
    expect(situacaoNacional('3525904')).toBe('prefeitura') // Jundiaí
    expect(situacaoNacional('3547304')).toBe('prefeitura') // Santana de Parnaíba
  })
  it('código antigo errado de Cajamar é normalizado', () => {
    expect(situacaoNacional('3508900')).toBe('emissor')
  })
  it('fora do mapa = desconhecido', () => {
    expect(situacaoNacional('0000000')).toBe('desconhecido')
    expect(situacaoNacional(undefined)).toBe('desconhecido')
  })
})
