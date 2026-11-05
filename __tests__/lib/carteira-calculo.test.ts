import { describe, expect, it } from 'vitest'
import {
  contratoVigente,
  contratosVencendoEm,
  movimentoDoMes,
  rankearClientes,
  resumirCarteira,
  valorMensalizado,
  type ContratoCarteira,
} from '@/features/carteira/calculo'

const HOJE = new Date(2026, 6, 30) // 30/07/2026

function contrato(over: Partial<ContratoCarteira> = {}): ContratoCarteira {
  return {
    id: 'c1',
    clienteId: 'cli1',
    clienteNome: 'ACME LTDA',
    servicoNome: 'Honorário mensal',
    valor: 1000,
    frequencia: 'mensal',
    status: 'ativo',
    dataInicio: new Date(2025, 0, 1),
    dataFim: null,
    ...over,
  }
}

describe('valorMensalizado — normaliza para receita por mês', () => {
  it('mensal vale o próprio valor', () => {
    expect(valorMensalizado(contrato({ valor: 1000, frequencia: 'mensal' }))).toBe(1000)
  })

  it('trimestral de 3.000 vale 1.000 por mês', () => {
    expect(valorMensalizado(contrato({ valor: 3000, frequencia: 'trimestral' }))).toBe(1000)
  })

  it('anual de 12.000 vale 1.000 por mês', () => {
    expect(valorMensalizado(contrato({ valor: 12000, frequencia: 'anual' }))).toBe(1000)
  })

  it('avulso não é receita recorrente', () => {
    // Sem isto, uma abertura de empresa de R$ 5.000 entraria no MRR como se
    // repetisse todo mês.
    expect(valorMensalizado(contrato({ valor: 5000, frequencia: 'avulso' }))).toBe(0)
  })

  it('contrato antigo sem frequência é tratado como mensal', () => {
    expect(valorMensalizado(contrato({ valor: 800, frequencia: null }))).toBe(800)
  })

  it('valor ausente ou negativo não vira receita', () => {
    expect(valorMensalizado(contrato({ valor: null }))).toBe(0)
    expect(valorMensalizado(contrato({ valor: -100 }))).toBe(0)
  })
})

describe('contratoVigente', () => {
  it('contrato encerrado não é vigente', () => {
    expect(contratoVigente(contrato({ dataFim: new Date(2026, 2, 31) }), HOJE)).toBe(false)
  })

  it('contrato que ainda não começou não é vigente', () => {
    expect(contratoVigente(contrato({ dataInicio: new Date(2026, 11, 1) }), HOJE)).toBe(false)
  })

  it('status diferente de ativo não é vigente', () => {
    expect(contratoVigente(contrato({ status: 'inativo' }), HOJE)).toBe(false)
  })

  it('sem datas e ativo é vigente', () => {
    expect(contratoVigente(contrato({ dataInicio: null, dataFim: null }), HOJE)).toBe(true)
  })
})

describe('resumirCarteira', () => {
  it('soma só o que é vigente e recorrente', () => {
    const r = resumirCarteira([
      contrato({ id: '1', clienteId: 'a', valor: 1000 }),
      contrato({ id: '2', clienteId: 'b', valor: 2000 }),
      contrato({ id: '3', clienteId: 'c', valor: 9999, dataFim: new Date(2026, 0, 31) }), // encerrado
      contrato({ id: '4', clienteId: 'd', valor: 5000, frequencia: 'avulso' }),           // não recorrente
      contrato({ id: '5', clienteId: 'e', valor: 9999, status: 'inativo' }),              // inativo
    ], HOJE)

    expect(r.mrr).toBe(3000)
    expect(r.contratosVigentes).toBe(2)
    expect(r.clientesComContrato).toBe(2)
    expect(r.ticketMedio).toBe(1500)
    expect(r.avulsosVigentes).toBe(1)
  })

  it('destaca quanto do MRR veio de contrato não mensal', () => {
    const r = resumirCarteira([
      contrato({ id: '1', clienteId: 'a', valor: 1000, frequencia: 'mensal' }),
      contrato({ id: '2', clienteId: 'b', valor: 12000, frequencia: 'anual' }),
    ], HOJE)

    expect(r.mrr).toBe(2000)
    expect(r.mrrNaoMensal).toBe(1000) // o anual mensalizado
  })

  it('carteira vazia não vira NaN', () => {
    const r = resumirCarteira([], HOJE)
    expect(r.mrr).toBe(0)
    expect(r.ticketMedio).toBe(0)
    expect(r.clientesComContrato).toBe(0)
  })

  it('dois contratos do mesmo cliente contam como um cliente', () => {
    const r = resumirCarteira([
      contrato({ id: '1', clienteId: 'a', valor: 1000 }),
      contrato({ id: '2', clienteId: 'a', valor: 500 }),
    ], HOJE)

    expect(r.mrr).toBe(1500)
    expect(r.clientesComContrato).toBe(1)
    expect(r.ticketMedio).toBe(1500)
  })
})

describe('rankearClientes — concentração', () => {
  it('ordena por MRR e calcula a fatia de cada um', () => {
    const r = rankearClientes([
      contrato({ id: '1', clienteId: 'a', clienteNome: 'A', valor: 6000 }),
      contrato({ id: '2', clienteId: 'b', clienteNome: 'B', valor: 3000 }),
      contrato({ id: '3', clienteId: 'c', clienteNome: 'C', valor: 1000 }),
    ], HOJE)

    expect(r.map((c) => c.clienteNome)).toEqual(['A', 'B', 'C'])
    expect(r[0].fatia).toBeCloseTo(0.6)
    expect(r[1].fatia).toBeCloseTo(0.3)
    expect(r.reduce((s, c) => s + c.fatia, 0)).toBeCloseTo(1)
  })

  it('agrupa contratos do mesmo cliente', () => {
    const r = rankearClientes([
      contrato({ id: '1', clienteId: 'a', clienteNome: 'A', valor: 1000 }),
      contrato({ id: '2', clienteId: 'a', clienteNome: 'A', valor: 500 }),
    ], HOJE)

    expect(r).toHaveLength(1)
    expect(r[0].mrr).toBe(1500)
    expect(r[0].contratos).toBe(2)
    expect(r[0].fatia).toBe(1)
  })
})

describe('contratosVencendoEm — receita que vai sumir', () => {
  it('pega só o que termina dentro da janela', () => {
    const r = contratosVencendoEm([
      contrato({ id: '1', valor: 1000, dataFim: new Date(2026, 7, 10) }),  // 11 dias
      contrato({ id: '2', valor: 2000, dataFim: new Date(2026, 9, 30) }),  // ~92 dias
      contrato({ id: '3', valor: 3000, dataFim: null }),                   // sem fim
    ], HOJE, 30)

    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('1')
    expect(r[0].mrrEmRisco).toBe(1000)
    expect(r[0].diasRestantes).toBe(11)
  })

  it('ordena do mais urgente para o menos', () => {
    const r = contratosVencendoEm([
      contrato({ id: 'longe', dataFim: new Date(2026, 8, 20) }),
      contrato({ id: 'perto', dataFim: new Date(2026, 7, 2) }),
    ], HOJE, 90)

    expect(r.map((c) => c.id)).toEqual(['perto', 'longe'])
  })

  it('ignora avulso — não é receita que se perde', () => {
    const r = contratosVencendoEm([
      contrato({ frequencia: 'avulso', dataFim: new Date(2026, 7, 5) }),
    ], HOJE, 30)
    expect(r).toHaveLength(0)
  })
})

describe('movimentoDoMes', () => {
  it('separa entradas de saídas e calcula o saldo', () => {
    const r = movimentoDoMes([
      contrato({ id: 'entrou', valor: 2000, dataInicio: new Date(2026, 6, 5) }),
      contrato({ id: 'saiu', valor: 800, dataInicio: new Date(2024, 0, 1), dataFim: new Date(2026, 6, 20) }),
      contrato({ id: 'antigo', valor: 5000, dataInicio: new Date(2023, 0, 1) }),
    ], HOJE)

    expect(r.entradas.map((c) => c.id)).toEqual(['entrou'])
    expect(r.saidas.map((c) => c.id)).toEqual(['saiu'])
    expect(r.mrrEntrou).toBe(2000)
    expect(r.mrrSaiu).toBe(800)
    expect(r.saldo).toBe(1200)
  })

  it('saldo negativo quando sai mais do que entra', () => {
    const r = movimentoDoMes([
      contrato({ id: 'saiu', valor: 3000, dataFim: new Date(2026, 6, 15) }),
    ], HOJE)
    expect(r.saldo).toBe(-3000)
  })
})
