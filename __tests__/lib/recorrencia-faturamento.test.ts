import { describe, expect, it } from 'vitest'
import {
  deveFaturarNoMes,
  vigenteNoMes,
} from '../../functions/src/scheduler/recorrencia'

/** Ajuda a montar o formato que o Firestore entrega (Timestamp com toDate). */
const ts = (iso: string) => ({ toDate: () => new Date(iso) })

describe('deveFaturarNoMes — só recorrente vira cobrança automática', () => {
  it('mensal fatura em qualquer mês', () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(deveFaturarNoMes({ frequencia: 'mensal' }, mes)).toBe(true)
    }
  })

  it('contrato antigo, sem o campo, é tratado como mensal', () => {
    // É o comportamento que já valia antes da correção: não muda cobrança
    // existente, só para de criar as que nunca deveriam ter nascido.
    expect(deveFaturarNoMes({}, 7)).toBe(true)
  })

  it('avulso nunca gera cobrança automática', () => {
    // O bug original: abertura de empresa era cobrada todo mês, para sempre.
    for (let mes = 1; mes <= 12; mes++) {
      expect(deveFaturarNoMes({ frequencia: 'avulso' }, mes)).toBe(false)
    }
  })

  it('anual fatura só no mês de aniversário do contrato', () => {
    const irpf = { frequencia: 'anual', dataInicio: ts('2025-03-10T12:00:00') }
    expect(deveFaturarNoMes(irpf, 3)).toBe(true)
    const outrosMeses = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    for (const mes of outrosMeses) {
      expect(deveFaturarNoMes(irpf, mes)).toBe(false)
    }
  })

  it('anual sem dataInicio cai em janeiro', () => {
    expect(deveFaturarNoMes({ frequencia: 'anual' }, 1)).toBe(true)
    expect(deveFaturarNoMes({ frequencia: 'anual' }, 6)).toBe(false)
  })

  it('trimestral fatura em jan, abr, jul e out', () => {
    const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const esperado = [true, false, false, true, false, false, true, false, false, true, false, false]
    expect(meses.map((m) => deveFaturarNoMes({ frequencia: 'trimestral' }, m))).toEqual(esperado)
  })

  it('frequência desconhecida fatura, em vez de silenciar', () => {
    // Deixar de cobrar sem avisar é pior que cobrar a mais: a mais alguém vê.
    expect(deveFaturarNoMes({ frequencia: 'quinzenal' }, 5)).toBe(true)
  })
})

describe('vigenteNoMes — contrato encerrado para de faturar', () => {
  it('sem datas, é sempre vigente', () => {
    expect(vigenteNoMes({}, 2026, 7)).toBe(true)
  })

  it('não fatura antes do início', () => {
    const contrato = { dataInicio: ts('2026-08-15T12:00:00') }
    expect(vigenteNoMes(contrato, 2026, 7)).toBe(false)
  })

  it('fatura já no mês em que começa, mesmo começando no meio', () => {
    const contrato = { dataInicio: ts('2026-08-15T12:00:00') }
    expect(vigenteNoMes(contrato, 2026, 8)).toBe(true)
  })

  it('para de faturar no mês seguinte ao fim', () => {
    // O bug original: dataFim era coletada no formulário e nunca lida, e como
    // nada vira o status ao chegar a data, o contrato faturava para sempre.
    const encerrado = { dataFim: ts('2026-03-31T12:00:00') }
    expect(vigenteNoMes(encerrado, 2026, 4)).toBe(false)
    expect(vigenteNoMes(encerrado, 2026, 12)).toBe(false)
  })

  it('ainda fatura o mês em que termina, mesmo terminando no meio', () => {
    // O serviço foi prestado parte do mês — a competência é devida.
    const contrato = { dataFim: ts('2026-03-15T12:00:00') }
    expect(vigenteNoMes(contrato, 2026, 3)).toBe(true)
  })

  it('respeita as duas pontas ao mesmo tempo', () => {
    const contrato = {
      dataInicio: ts('2026-02-01T12:00:00'),
      dataFim: ts('2026-04-30T12:00:00'),
    }
    expect(vigenteNoMes(contrato, 2026, 1)).toBe(false)
    expect(vigenteNoMes(contrato, 2026, 2)).toBe(true)
    expect(vigenteNoMes(contrato, 2026, 3)).toBe(true)
    expect(vigenteNoMes(contrato, 2026, 4)).toBe(true)
    expect(vigenteNoMes(contrato, 2026, 5)).toBe(false)
  })

  it('vira o ano corretamente', () => {
    const contrato = { dataFim: ts('2026-12-31T12:00:00') }
    expect(vigenteNoMes(contrato, 2026, 12)).toBe(true)
    expect(vigenteNoMes(contrato, 2027, 1)).toBe(false)
  })

  it('fevereiro curto não engana o último dia do mês', () => {
    const contrato = { dataInicio: ts('2026-02-28T20:00:00') }
    expect(vigenteNoMes(contrato, 2026, 2)).toBe(true)
  })
})
