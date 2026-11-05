import { describe, expect, it } from 'vitest'
import { montarFichaCliente } from '@/lib/cliente-ficha'
import { CLIENTE_COLUMNS } from '@/lib/clientes-import'

describe('montarFichaCliente — ficha completa ao clicar no cliente', () => {
  const ficha = montarFichaCliente({
    razaoSocial: 'ARTE E PRIME', cpfCnpj: '33854681000104', responsavelNome: 'Fulano',
    responsavelSenhaMeuGov: 'x', aceiteWhatsAppCobranca: true, responsavelFinanceiroEmail: 'f@x.com',
  })
  const secao = (t: string) => ficha.secoes.find((s) => s.titulo === t)!

  it('mostra todos os campos da ficha, nenhum a mais nem a menos', () => {
    expect(ficha.total).toBe(CLIENTE_COLUMNS.length)
    expect(ficha.preenchidos).toBe(6)
    expect(ficha.secoes.some((s) => s.titulo === 'Outros')).toBe(false)
  })

  it('agrupa nas seções do formulário', () => {
    expect(secao('Dados gerais').campos.map((c) => c.key)).toContain('razaoSocial')
    expect(secao('Credenciais do representante').campos.map((c) => c.key)).toContain('responsavelSenhaMeuGov')
    expect(secao('Financeiro').campos.map((c) => c.key)).toContain('responsavelFinanceiroEmail')
    expect(secao('Representante').campos.map((c) => c.key)).not.toContain('responsavelFinanceiroEmail')
  })

  it('marca credenciais e traduz sim/não', () => {
    const meuGov = secao('Credenciais do representante').campos.find((c) => c.key === 'responsavelSenhaMeuGov')!
    expect(meuGov.credencial).toBe(true)
    expect(secao('Cobrança por WhatsApp').campos.find((c) => c.key === 'aceiteWhatsAppCobranca')!.valor).toBe('Sim')
  })
})
