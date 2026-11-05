import { describe, expect, it } from 'vitest'
import { montarRelatorioClientes } from '@/lib/clientes-relatorio'
import { CLIENTE_COLUMNS } from '@/lib/clientes-import'

const cheio = {
  id: 'a', status: 'ativo', cpfCnpj: '33854681000104', razaoSocial: 'ARTE E PRIME', email: 'x@y.com',
  responsavelSenhaMeuGov: 'SenhaReal#1', cidade: 'São Paulo', uf: 'SP',
}
const vazio = { id: 'b', status: 'ativo', cpfCnpj: '11444777000161', razaoSocial: 'POUCOS DADOS' }
const inativo = { id: 'c', status: 'inativo', cpfCnpj: '52998224725', razaoSocial: 'INATIVO' }

describe('relatório da ficha completa dos clientes ativos', () => {
  const r = montarRelatorioClientes({
    clientes: [vazio, cheio, inativo],
    fiscais: [{ clienteId: 'a', municipioIbge: '3550308', municipioEmissor: 'São Paulo', inscricaoMunicipal: '123', ambienteEmissao: 'producao', credenciais: { certificadoStoragePath: 'x', certValido: true } }],
  })
  const cab = r.clientes[0]
  const linha = (nome: string) => r.clientes.find((l) => l.includes(nome))!

  it('só clientes ativos, todos os campos da ficha', () => {
    expect(r.clientes).toHaveLength(3) // cabeçalho + 2 ativos
    for (const c of CLIENTE_COLUMNS) expect(cab).toContain(c.label)
    expect(r.clientes.some((l) => l.includes('INATIVO'))).toBe(false)
  })

  it('mostra preenchidos, % completo e a lista do que está em branco', () => {
    const l = linha('POUCOS DADOS')
    expect(l[cab.indexOf('Preenchidos')]).toBe(`3/${CLIENTE_COLUMNS.length}`) // CPF/CNPJ, razão social, status
    expect(l[cab.indexOf('Campos em branco')]).toContain('E-mail')
    expect(Number(l[cab.indexOf('% completo')])).toBeLessThan(10)
  })

  it('senha nunca sai com valor', () => {
    const l = linha('ARTE E PRIME')
    expect(l.join('|')).not.toContain('SenhaReal#1')
    expect(l[cab.indexOf('Responsável — Senha MEU GOV')]).toBe('✔ preenchida')
  })

  it('resumo por campo conta preenchidos e em branco', () => {
    const email = r.resumoPorCampo.find((l) => l[0] === 'E-mail')!
    expect(email.slice(1, 3)).toEqual(['1', '1'])
  })

  it('aba fiscal mostra município, Ambiente Nacional, certificado e ambiente', () => {
    const f = r.fiscal.find((l) => l.includes('ARTE E PRIME'))!
    expect(f).toContain('São Paulo')
    expect(f).toContain('Sim')            // emite pelo Nacional
    expect(f).toContain('Válido')         // certificado
    expect(f).toContain('Produção')
    const semConfig = r.fiscal.find((l) => l.includes('POUCOS DADOS'))!
    expect(semConfig).toContain('Sem configuração fiscal')
  })
})
