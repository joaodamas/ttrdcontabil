import { describe, expect, it } from 'vitest'
import {
  agruparInadimplencia,
  calcularAging,
  diasDeAtraso,
  estaVencido,
  paraItemAging,
  totalEmAberto,
  totalVencido,
  type ItemAging,
} from '@/features/financeiro/aging'

const AGORA = new Date('2026-07-30T12:00:00.000Z')
const DIA = 86_400_000

/** Vencimento a N dias (e opcionalmente N horas) atrás de AGORA. */
function ha(dias: number, horas = 0): Date {
  return new Date(AGORA.getTime() - dias * DIA - horas * 3_600_000)
}

function daqui(dias: number): Date {
  return new Date(AGORA.getTime() + dias * DIA)
}

function item(over: Partial<ItemAging> = {}): ItemAging {
  return {
    clienteNome: 'ACME LTDA',
    valor: 1000,
    vencimento: ha(5),
    recebivelEmAberto: true,
    ...over,
  }
}

function faixa(faixas: ReturnType<typeof calcularAging>, label: string) {
  const encontrada = faixas.find((f) => f.label === label)
  if (!encontrada) throw new Error(`Faixa ${label} não existe`)
  return encontrada
}

describe('paraItemAging — normaliza o documento do Firestore', () => {
  it('só receita pendente é recebível em aberto', () => {
    expect(paraItemAging({ tipo: 'receita', status: 'pendente' }).recebivelEmAberto).toBe(true)
    expect(paraItemAging({ tipo: 'receita', status: 'pago' }).recebivelEmAberto).toBe(false)
    expect(paraItemAging({ tipo: 'despesa', status: 'pendente' }).recebivelEmAberto).toBe(false)
    expect(paraItemAging({ tipo: 'receita', status: 'cancelado' }).recebivelEmAberto).toBe(false)
  })

  it('valor ausente ou ilegível vira 0, não NaN', () => {
    expect(paraItemAging({ valor: undefined }).valor).toBe(0)
    expect(paraItemAging({ valor: 'abc' }).valor).toBe(0)
    expect(paraItemAging({ valor: 1234.56 }).valor).toBe(1234.56)
  })

  it('nome vazio vira null para cair no rótulo "Sem cliente"', () => {
    expect(paraItemAging({ clienteNome: '   ' }).clienteNome).toBeNull()
    expect(paraItemAging({}).clienteNome).toBeNull()
    expect(paraItemAging({ clienteNome: ' ACME ' }).clienteNome).toBe('ACME')
  })

  it('aceita Timestamp do Firestore, Date e ausência', () => {
    const data = new Date('2026-01-10T00:00:00.000Z')
    expect(paraItemAging({ dataVencimento: { toDate: () => data } }).vencimento).toEqual(data)
    expect(paraItemAging({ dataVencimento: data }).vencimento).toEqual(data)
    expect(paraItemAging({}).vencimento).toBeNull()
  })
})

describe('estaVencido / diasDeAtraso', () => {
  it('vencido é comparação de data, não arredondamento de dia', () => {
    // Este é o caso que fazia o aging e o card "Em Atraso" discordarem: venceu
    // hoje de manhã, floor() dava 0 dia e o valor caía em "A vencer" enquanto o
    // card já contava como atraso.
    expect(estaVencido(item({ vencimento: ha(0, 3) }), AGORA)).toBe(true)
    expect(estaVencido(item({ vencimento: daqui(1) }), AGORA)).toBe(false)
  })

  it('lançamento sem vencimento não está vencido', () => {
    expect(estaVencido(item({ vencimento: null }), AGORA)).toBe(false)
  })

  it('despesa e recebido não entram no atraso', () => {
    expect(estaVencido(item({ recebivelEmAberto: false, vencimento: ha(90) }), AGORA)).toBe(false)
  })

  it('conta dias inteiros', () => {
    expect(diasDeAtraso(ha(31), AGORA)).toBe(31)
    expect(diasDeAtraso(ha(0, 23), AGORA)).toBe(0)
  })
})

describe('calcularAging — faixas de recebíveis', () => {
  it('distribui cada lançamento na faixa certa', () => {
    const faixas = calcularAging(
      [
        item({ valor: 100, vencimento: daqui(10) }),
        item({ valor: 200, vencimento: ha(1) }),
        item({ valor: 300, vencimento: ha(20) }),
        item({ valor: 400, vencimento: ha(45) }),
        item({ valor: 500, vencimento: ha(400) }),
      ],
      AGORA
    )

    expect(faixa(faixas, 'A vencer').total).toBe(100)
    expect(faixa(faixas, '1–15 dias').total).toBe(200)
    expect(faixa(faixas, '16–30 dias').total).toBe(300)
    expect(faixa(faixas, '31–60 dias').total).toBe(400)
    expect(faixa(faixas, '61+ dias').total).toBe(500)
    expect(faixas.every((f) => f.quantidade === 1)).toBe(true)
  })

  it('respeita as bordas de cada faixa', () => {
    const bordas: Array<[number, string]> = [
      [15, '1–15 dias'],
      [16, '16–30 dias'],
      [30, '16–30 dias'],
      [31, '31–60 dias'],
      [60, '31–60 dias'],
      [61, '61+ dias'],
    ]
    for (const [dias, label] of bordas) {
      const faixas = calcularAging([item({ valor: 10, vencimento: ha(dias) })], AGORA)
      expect(faixa(faixas, label).quantidade, `${dias} dias deveria cair em ${label}`).toBe(1)
    }
  })

  it('vencido há poucas horas é atraso, não "A vencer"', () => {
    const faixas = calcularAging([item({ valor: 900, vencimento: ha(0, 3) })], AGORA)
    expect(faixa(faixas, 'A vencer').total).toBe(0)
    expect(faixa(faixas, '1–15 dias').total).toBe(900)
  })

  it('a soma das faixas vencidas é todo o dinheiro vencido — é o número do card "Em Atraso"', () => {
    const itens = [
      item({ valor: 100, vencimento: daqui(3) }),
      item({ valor: 250, vencimento: ha(0, 1) }),
      item({ valor: 500, vencimento: ha(7) }),
      item({ valor: 900, vencimento: ha(200) }),
    ]
    const faixas = calcularAging(itens, AGORA)

    const vencidoDireto = itens
      .filter((i) => estaVencido(i, AGORA))
      .reduce((soma, i) => soma + i.valor, 0)

    expect(totalVencido(faixas)).toBe(vencidoDireto)
    expect(totalVencido(faixas)).toBe(1650)
    expect(totalEmAberto(faixas)).toBe(1750)
  })

  it('ignora despesa, pago e lançamento sem vencimento', () => {
    const faixas = calcularAging(
      [
        item({ valor: 9999, recebivelEmAberto: false, vencimento: ha(30) }),
        item({ valor: 8888, vencimento: null }),
      ],
      AGORA
    )
    expect(totalEmAberto(faixas)).toBe(0)
    expect(faixas.every((f) => f.quantidade === 0)).toBe(true)
  })

  it('base vazia devolve todas as faixas zeradas, não faixa faltando', () => {
    const faixas = calcularAging([], AGORA)
    expect(faixas).toHaveLength(5)
    expect(totalVencido(faixas)).toBe(0)
  })
})

describe('agruparInadimplencia — conteúdo da planilha de cobrança', () => {
  it('agrupa por cliente e ordena pelo maior devedor', () => {
    const linhas = agruparInadimplencia(
      [
        item({ clienteNome: 'ALFA', valor: 100, vencimento: ha(10) }),
        item({ clienteNome: 'BETA', valor: 900, vencimento: ha(3) }),
        item({ clienteNome: 'ALFA', valor: 300, vencimento: ha(40) }),
      ],
      AGORA
    )

    expect(linhas.map((l) => l.cliente)).toEqual(['BETA', 'ALFA'])
    expect(linhas[1].total).toBe(400)
    expect(linhas[1].quantidade).toBe(2)
  })

  it('vencimento mais antigo é o menor de verdade, em qualquer ordem de entrada', () => {
    // O código anterior guardava a data já formatada ("dd/mm/aaaa") e a
    // recomparava desmontando a string. Comparação de data por texto erra calado
    // e o erro ia para a planilha usada para cobrar.
    const maisAntigo = ha(120)
    const linhasDesc = agruparInadimplencia(
      [
        item({ clienteNome: 'ALFA', valor: 100, vencimento: ha(2) }),
        item({ clienteNome: 'ALFA', valor: 100, vencimento: maisAntigo }),
      ],
      AGORA
    )
    const linhasAsc = agruparInadimplencia(
      [
        item({ clienteNome: 'ALFA', valor: 100, vencimento: maisAntigo }),
        item({ clienteNome: 'ALFA', valor: 100, vencimento: ha(2) }),
      ],
      AGORA
    )

    expect(linhasDesc[0].vencimentoMaisAntigo).toEqual(maisAntigo)
    expect(linhasAsc[0].vencimentoMaisAntigo).toEqual(maisAntigo)
  })

  it('só entra o que está vencido — a vencer não é inadimplência', () => {
    const linhas = agruparInadimplencia(
      [
        item({ clienteNome: 'ALFA', valor: 100, vencimento: daqui(5) }),
        item({ clienteNome: 'BETA', valor: 200, vencimento: ha(1) }),
        item({ clienteNome: 'GAMA', valor: 300, recebivelEmAberto: false, vencimento: ha(50) }),
      ],
      AGORA
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0].cliente).toBe('BETA')
  })

  it('lançamento sem nome de cliente não some da planilha', () => {
    const linhas = agruparInadimplencia(
      [item({ clienteNome: null, valor: 700, vencimento: ha(9) })],
      AGORA
    )
    expect(linhas[0].cliente).toBe('Sem cliente')
    expect(linhas[0].total).toBe(700)
  })

  it('o total da planilha bate com o total vencido do aging', () => {
    const itens = [
      item({ clienteNome: 'ALFA', valor: 120, vencimento: ha(0, 2) }),
      item({ clienteNome: 'BETA', valor: 340, vencimento: ha(18) }),
      item({ clienteNome: 'ALFA', valor: 560, vencimento: ha(75) }),
      item({ clienteNome: 'GAMA', valor: 780, vencimento: daqui(4) }),
    ]

    const totalPlanilha = agruparInadimplencia(itens, AGORA).reduce((s, l) => s + l.total, 0)
    expect(totalPlanilha).toBe(totalVencido(calcularAging(itens, AGORA)))
  })
})
