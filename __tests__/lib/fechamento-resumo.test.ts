import { describe, expect, it } from 'vitest'
import {
  obrigacoesEmAberto,
  resumirFechamentos,
  situacaoObrigacao,
  temPendencia,
} from '@/lib/fechamento-resumo'

const row = (das: string, esocial = 'na', reinf = 'na', fgts = 'na') => ({
  dasStatus: das,
  esocialStatus: esocial,
  reinfStatus: reinf,
  fgtsStatus: fgts,
})

describe('fechamento-resumo', () => {
  it('classifica cada status em uma única situação', () => {
    expect(situacaoObrigacao('enviado')).toBe('concluida')
    expect(situacaoObrigacao('ok')).toBe('concluida')
    expect(situacaoObrigacao('sm')).toBe('concluida')
    expect(situacaoObrigacao('pendente')).toBe('em_aberto')
    expect(situacaoObrigacao('parcial')).toBe('em_aberto')
    expect(situacaoObrigacao('guia')).toBe('em_aberto')
    expect(situacaoObrigacao('na')).toBe('nao_se_aplica')
    expect(situacaoObrigacao(undefined)).toBe('em_aberto')
  })

  it('pendência considera as 4 obrigações, não só o DAS', () => {
    expect(temPendencia(row('ok', 'pendente'))).toBe(true)
    expect(temPendencia(row('ok', 'ok', 'sm', 'na'))).toBe(false)
    expect(obrigacoesEmAberto(row('guia', 'parcial', 'ok', 'na'))).toBe(2)
  })

  it('KPIs de cliente somam o total e os de obrigação somam as aplicáveis', () => {
    const rows = [
      row('ok', 'ok', 'na', 'na'), // em dia
      row('pendente', 'ok', 'na', 'na'), // pendência no DAS
      row('enviado', 'guia', 'na', 'na'), // DAS ok, mas eSocial com guia
      row('sm', 'na', 'na', 'na'), // em dia
      row('parcial', 'pendente', 'pendente', 'ok'),
    ]
    const r = resumirFechamentos(rows)
    expect(r.totalClientes).toBe(5)
    expect(r.clientesEmDia + r.clientesComPendencia).toBe(r.totalClientes)
    expect(r.clientesComPendencia).toBe(3)
    expect(r.obrigacoesConcluidas + r.obrigacoesEmAberto).toBe(r.obrigacoesAplicaveis)
    expect(r.obrigacoesAplicaveis).toBe(11)
    expect(r.obrigacoesEmAberto).toBe(5)
    expect(r.pctConcluido).toBe(Math.round((6 / 11) * 100))
    expect(r.das).toEqual({ enviados: 3, pendentes: 1, parciais: 1 })
  })

  it('lista vazia e "tudo não se aplica"', () => {
    expect(resumirFechamentos([]).pctConcluido).toBe(0)
    const r = resumirFechamentos([row('na')])
    expect(r.clientesEmDia).toBe(1)
    expect(r.pctConcluido).toBe(100)
  })
})
