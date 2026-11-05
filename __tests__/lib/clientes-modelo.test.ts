import { describe, expect, it } from 'vitest'
import { CLIENTE_COLUMNS, SERVICO_COLUMNS, montarModeloClientes, escolherClientesExemplo, validarClienteRow } from '@/lib/clientes-import'

const completo = {
  id: 'c1', cpfCnpj: '33854681000104', tipoPessoa: 'pj', razaoSocial: 'ARTE E PRIME PLANEJADOS LTDA', nomeFantasia: 'Arte & Prime',
  status: 'ativo', regimeTributario: 'simples_nacional', email: 'contato@arteprime.com.br', cidade: 'São Paulo', uf: 'SP',
  mensalidade: 450, responsavelNome: 'Fulano', responsavelCpf: '52998224725', responsavelRg: '12.345.678-9', responsavelDataNascimento: '01/02/1980',
}
const pobre = { id: 'c2', cpfCnpj: '11444777000161', razaoSocial: 'POUCOS DADOS LTDA' }

describe('modelo de importação de clientes com exemplos reais', () => {
  it('escolhe os clientes de cadastro mais completo como exemplo', () => {
    expect(escolherClientesExemplo([pobre, completo], 1).map((c) => c.id)).toEqual(['c1'])
  })

  it('abas Clientes e Serviços vêm só com o cabeçalho, prontas para preencher', () => {
    const m = montarModeloClientes({ clientes: [completo], servicosDosClientes: [], tiposServico: [] })
    expect(m.clientes).toEqual([CLIENTE_COLUMNS.map((c) => c.label)])
    expect(m.servicos).toEqual([SERVICO_COLUMNS.map((c) => c.label)])
  })

  it('exemplos usam as mesmas colunas e os valores no formato aceito pela importação', () => {
    const m = montarModeloClientes({ clientes: [completo], servicosDosClientes: [], tiposServico: [] })
    const [cab, linha] = m.exemplosClientes
    expect(cab).toEqual(CLIENTE_COLUMNS.map((c) => c.label))
    const col = (k: string) => linha[CLIENTE_COLUMNS.findIndex((c) => c.key === k)]
    expect(col('razaoSocial')).toBe('ARTE E PRIME PLANEJADOS LTDA')
    expect(col('cpfCnpj')).toBe('33.854.681/0001-04')
    expect(col('regimeTributario')).toBe('simples_nacional')
    expect(col('mensalidade')).toBe('450')
  })

  it('dados pessoais do responsável saem mascarados no exemplo', () => {
    const m = montarModeloClientes({ clientes: [completo], servicosDosClientes: [], tiposServico: [] })
    const linha = m.exemplosClientes[1].join(' | ')
    expect(linha).not.toContain('52998224725')
    expect(linha).not.toContain('12.345.678-9')
    expect(linha).not.toContain('01/02/1980')
  })

  it('tipos de serviço listam o código exigido na aba Serviços', () => {
    const m = montarModeloClientes({ clientes: [], servicosDosClientes: [], tiposServico: [{ id: 's1', codigo: 'COB04', nome: 'Contabilidade', valorPadrao: 350, frequencia: 'mensal' }] })
    expect(m.tiposServico[1]).toEqual(['COB04', 'Contabilidade', '350', 'mensal'])
  })

  it('serviços de exemplo saem com o código do serviço, não o id', () => {
    const m = montarModeloClientes({
      clientes: [completo],
      servicosDosClientes: [{ clienteId: 'c1', servicoId: 's1', valor: 450, diaVencimento: 10 }],
      tiposServico: [{ id: 's1', codigo: 'COB04', nome: 'Contabilidade' }],
    })
    expect(m.exemplosServicos[1].slice(0, 4)).toEqual(['33.854.681/0001-04', 'COB04', '450', '10'])
  })
})

describe('planilha = ficha de cadastro do cliente', () => {
  const keys = CLIENTE_COLUMNS.map((c) => c.key)

  it('tem os campos do representante, do financeiro e o aceite de cobrança da ficha', () => {
    for (const k of [
      'responsavelCnh', 'responsavelDataEmissao', 'responsavelOrgaoEmissor', 'responsavelLocalNascimento',
      'responsavelNomePai', 'responsavelNomeMae', 'responsavelPis', 'responsavelComunhaoBens',
      'responsavelEscolaridade', 'responsavelFormacaoSuperior', 'responsavelTituloEleitor',
      'responsavelCep', 'responsavelEndereco', 'responsavelNumero', 'responsavelComplemento',
      'responsavelBairro', 'responsavelCidade', 'responsavelUf',
      'responsavelFinanceiroWhatsapp', 'responsavelFinanceiroPreferencial', 'aceiteWhatsAppCobranca',
    ]) expect(keys).toContain(k)
  })

  it('nunca tem senha nem credencial', () => {
    expect(keys.some((k) => /senha|login|pin/i.test(k))).toBe(false)
  })

  it('sim/não viram booleanos; aceite registra data e origem da planilha', () => {
    const base = { cpfCnpj: '33.854.681/0001-04', razaoSocial: 'ARTE E PRIME PLANEJADOS LTDA' }
    const sim = validarClienteRow({ ...base, aceiteWhatsAppCobranca: 'Sim', responsavelFinanceiroPreferencial: 'sim', responsavelPis: '123' }, 1, new Set(), new Map())
    expect(sim.erros).toEqual([])
    expect(sim.payload.aceiteWhatsAppCobranca).toBe(true)
    expect(sim.payload.aceiteWhatsAppCobrancaOrigem).toBe('Planilha de cadastro')
    expect(typeof sim.payload.aceiteWhatsAppCobrancaEm).toBe('string')
    expect(sim.payload.responsavelFinanceiroPreferencial).toBe(true)
    expect(sim.payload.responsavelPis).toBe('123')
    const nao = validarClienteRow({ ...base, aceiteWhatsAppCobranca: 'não' }, 2, new Set(), new Map())
    expect(nao.payload.aceiteWhatsAppCobranca).toBe(false)
    const ruim = validarClienteRow({ ...base, aceiteWhatsAppCobranca: 'talvez' }, 3, new Set(), new Map())
    expect(ruim.erros.join(' ')).toMatch(/sim ou não/)
  })

  it('documentos pessoais do representante saem mascarados nos exemplos', () => {
    const m = montarModeloClientes({ clientes: [{ id: 'c', cpfCnpj: '33854681000104', razaoSocial: 'X', responsavelPis: '12345678901', responsavelCnh: '99887766', responsavelNomeMae: 'Maria Real' }], servicosDosClientes: [], tiposServico: [] })
    const linha = m.exemplosClientes[1].join('|')
    expect(linha).not.toContain('12345678901')
    expect(linha).not.toContain('99887766')
    expect(linha).not.toContain('Maria Real')
  })
})
