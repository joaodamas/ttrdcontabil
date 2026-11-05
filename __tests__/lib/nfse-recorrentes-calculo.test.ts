import { describe, expect, it } from 'vitest'
import {
  clampDiaEmissao,
  contratoVigenteEm,
  proximaEmissao,
  totalMensalVigente,
  ultimoDiaDoMes,
  type ContratoRecorrenteCalculo,
} from '@/features/nfse-recorrentes/calculo'
import { validarContratoRecorrente } from '@/features/nfse-recorrentes/validacao'

const HOJE = new Date(2026, 6, 10) // 10/07/2026

function contrato(over: Partial<ContratoRecorrenteCalculo> = {}): ContratoRecorrenteCalculo {
  return {
    ativo: true,
    valor: 1500,
    diaEmissao: 5,
    dataInicio: new Date(2026, 0, 1),
    dataFim: null,
    ...over,
  }
}

describe('clampDiaEmissao — mês curto', () => {
  it('dia 31 em fevereiro vira o último dia do mês, não 3 de março', () => {
    // new Date(2026, 1, 31) transborda em silêncio para março: emitir na
    // competência errada é retrabalho na prefeitura.
    expect(clampDiaEmissao(31, 2026, 2)).toBe(28)
    expect(clampDiaEmissao(31, 2028, 2)).toBe(29) // bissexto
    expect(clampDiaEmissao(31, 2026, 4)).toBe(30)
  })

  it('dia que cabe no mês passa intacto', () => {
    expect(clampDiaEmissao(5, 2026, 2)).toBe(5)
  })

  it('dia inválido nunca vira dia 0 nem NaN', () => {
    expect(clampDiaEmissao(0, 2026, 7)).toBe(1)
    expect(clampDiaEmissao(Number.NaN, 2026, 7)).toBe(1)
  })

  it('ultimoDiaDoMes conhece os meses de 30 e 31', () => {
    expect(ultimoDiaDoMes(2026, 7)).toBe(31)
    expect(ultimoDiaDoMes(2026, 6)).toBe(30)
  })
})

describe('contratoVigenteEm', () => {
  it('contrato suspenso na mão não é vigente', () => {
    expect(contratoVigenteEm(contrato({ ativo: false }), HOJE)).toBe(false)
  })

  it('contrato encerrado por dataFim não é vigente', () => {
    // Sem respeitar dataFim, contrato encerrado fatura para sempre — foi o que
    // já aconteceu em clientes_servicos.
    expect(contratoVigenteEm(contrato({ dataFim: new Date(2026, 5, 30) }), HOJE)).toBe(false)
  })

  it('contrato que começa amanhã ainda não é vigente', () => {
    expect(contratoVigenteEm(contrato({ dataInicio: new Date(2026, 6, 11) }), HOJE)).toBe(false)
  })

  it('vigência que termina hoje ainda vale hoje', () => {
    expect(contratoVigenteEm(contrato({ dataFim: new Date(2026, 6, 10) }), HOJE)).toBe(true)
  })

  it('hora do dia não muda a resposta', () => {
    const inicioHoje = new Date(2026, 6, 10, 0, 0, 0)
    expect(contratoVigenteEm(contrato({ dataInicio: inicioHoje }), new Date(2026, 6, 10, 9, 0, 0))).toBe(true)
  })
})

describe('proximaEmissao', () => {
  it('dia do mês já passou: emite no mês seguinte', () => {
    expect(proximaEmissao(contrato({ diaEmissao: 5 }), HOJE)).toEqual(new Date(2026, 7, 5))
  })

  it('dia do mês ainda vem: emite neste mês', () => {
    expect(proximaEmissao(contrato({ diaEmissao: 20 }), HOJE)).toEqual(new Date(2026, 6, 20))
  })

  it('emite hoje quando é o dia', () => {
    expect(proximaEmissao(contrato({ diaEmissao: 10 }), HOJE)).toEqual(new Date(2026, 6, 10))
  })

  it('aplica o clamp do mês curto', () => {
    const ref = new Date(2026, 1, 1) // 01/02/2026
    expect(proximaEmissao(contrato({ diaEmissao: 31 }), ref)).toEqual(new Date(2026, 1, 28))
  })

  it('contrato que só começa no ano que vem tem próxima emissão na vigência', () => {
    // Contar a partir de "hoje" devolveria null e a tela diria que o contrato
    // assinado nunca emite.
    const futuro = contrato({ dataInicio: new Date(2027, 0, 1), diaEmissao: 10 })
    expect(proximaEmissao(futuro, HOJE)).toEqual(new Date(2027, 0, 10))
  })

  it('não emite depois da dataFim', () => {
    const encerrando = contrato({ diaEmissao: 25, dataFim: new Date(2026, 6, 20) })
    expect(proximaEmissao(encerrando, HOJE)).toBeNull()
  })

  it('contrato suspenso não tem próxima emissão', () => {
    expect(proximaEmissao(contrato({ ativo: false }), HOJE)).toBeNull()
  })
})

describe('totalMensalVigente', () => {
  it('soma só o que está valendo', () => {
    const total = totalMensalVigente(
      [
        contrato({ valor: 1000 }),
        contrato({ valor: 500, ativo: false }),
        contrato({ valor: 300, dataFim: new Date(2026, 0, 31) }),
        contrato({ valor: 200 }),
      ],
      HOJE
    )
    expect(total).toBe(1200)
  })

  it('valor ausente ou negativo não entra no total', () => {
    expect(totalMensalVigente([contrato({ valor: null }), contrato({ valor: -50 })], HOJE)).toBe(0)
  })
})

describe('validarContratoRecorrente', () => {
  const base = {
    tomadorId: 'tom-1',
    descricao: 'Consultoria contábil do mês',
    valor: 1500,
    diaEmissao: 5,
    dataInicio: new Date(2026, 0, 1),
  }

  it('contrato completo passa', () => {
    expect(validarContratoRecorrente(base)).toEqual([])
  })

  it('sem tomador não passa — é o buraco do prestador == tomador', () => {
    expect(validarContratoRecorrente({ ...base, tomadorId: '' })[0]).toMatch(/tomador/i)
  })

  it('valor zero ou negativo vira nota inválida na prefeitura', () => {
    expect(validarContratoRecorrente({ ...base, valor: 0 })).toContain(
      'O valor precisa ser um número maior que zero.'
    )
    expect(validarContratoRecorrente({ ...base, valor: -10 })).toHaveLength(1)
  })

  it('dia fora de 1–31 (ou fracionado) é contrato que nunca fatura', () => {
    expect(validarContratoRecorrente({ ...base, diaEmissao: 0 })).toHaveLength(1)
    expect(validarContratoRecorrente({ ...base, diaEmissao: 32 })).toHaveLength(1)
    expect(validarContratoRecorrente({ ...base, diaEmissao: 5.5 })).toHaveLength(1)
  })

  it('vigência invertida é contrato morto no nascimento', () => {
    const erros = validarContratoRecorrente({
      ...base,
      dataFim: new Date(2025, 11, 31),
    })
    expect(erros).toEqual(['A data de fim não pode ser anterior à data de início.'])
  })

  it('descrição vazia ou acima do limite das regras é recusada', () => {
    expect(validarContratoRecorrente({ ...base, descricao: '   ' })).toHaveLength(1)
    expect(validarContratoRecorrente({ ...base, descricao: 'x'.repeat(2001) })).toEqual([
      'A descrição passa de 2000 caracteres.',
    ])
  })

  it('alíquota vazia herda do cliente; fora de 0–100 é erro', () => {
    expect(validarContratoRecorrente({ ...base, aliquota: null })).toEqual([])
    expect(validarContratoRecorrente({ ...base, aliquota: 120 })).toHaveLength(1)
  })
})
