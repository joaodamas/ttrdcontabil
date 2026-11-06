// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  CAMPOS_KPIS_FINANCEIROS,
  COLECAO_KPIS,
  COLECAO_KPIS_FINANCEIRO,
  ErroEntradaKpis,
  contarPorStatus,
  dataCivilSaoPaulo,
  idDocKpis,
  janelaVencimento,
  montarDocsKpis,
  somarValores,
  validarMesAno,
} from '../../functions/src/dashboard-kpis-regras'
import { recalcularKpisTenant } from '../../functions/src/dashboard-kpis'
import { podeLerFinanceiro } from '../../functions/src/usuarios/perfis'
import {
  dataAtualizacaoKpis,
  kpisDesatualizados,
  rotuloAtualizacaoKpis,
} from '../../src/lib/dashboard-kpis'

describe('KPIs do Painel — regras puras', () => {
  it('id do doc: tenant_ano_mm', () => {
    expect(idDocKpis('ttrd', 2026, 3)).toBe('ttrd_2026_03')
    expect(idDocKpis('ttrd', 2026, 11)).toBe('ttrd_2026_11')
  })

  it('data civil e janela de vencimento no fuso de São Paulo (a function roda em UTC)', () => {
    // 22h de Brasília do dia 06 = 01h UTC do dia 07.
    const agora = new Date('2026-11-07T01:00:00Z')
    expect(dataCivilSaoPaulo(agora)).toEqual({ ano: 2026, mes: 11, dia: 6 })
    const { inicioHoje, fimEm7Dias } = janelaVencimento(agora)
    expect(inicioHoje.toISOString()).toBe('2026-11-06T03:00:00.000Z')
    expect(fimEm7Dias.toISOString()).toBe('2026-11-14T02:59:59.999Z')
  })

  it('virada de mês/ano em São Paulo', () => {
    expect(validarMesAno(undefined, new Date('2027-01-01T02:00:00Z'))).toEqual({ mes: 12, ano: 2026 })
    expect(validarMesAno({ mes: 2, ano: 2025 }, new Date())).toEqual({ mes: 2, ano: 2025 })
    expect(() => validarMesAno({ mes: 13 }, new Date())).toThrow(ErroEntradaKpis)
    expect(() => validarMesAno({ ano: 1999 }, new Date())).toThrow(ErroEntradaKpis)
    expect(() => validarMesAno({ mes: 'x' }, new Date())).toThrow(ErroEntradaKpis)
  })

  it('contagem por status e soma ignoram lixo', () => {
    expect(contarPorStatus(['aberta', 'aberta', 'concluida', undefined, '', 3])).toEqual({ aberta: 2, concluida: 1 })
    expect(somarValores([10, 2.5, '7', null, Number.NaN, Infinity])).toBe(12.5)
  })

  it('nenhum campo financeiro vai para o doc operacional', () => {
    const { operacional, financeiro } = montarDocsKpis(
      { tenantId: 't', mes: 1, ano: 2026, atualizadoPorId: 'u', atualizadoPorNome: 'U', origem: 'scheduler' },
      { totalClientesAtivos: 1, compCounts: {}, tarefasPendentes: 2 },
      { somaVencendo: 1, vencendoCount: 1, somaAtrasados: 2, atrasadosCount: 1 },
    )
    for (const campo of CAMPOS_KPIS_FINANCEIROS) {
      expect(operacional).not.toHaveProperty(campo)
      expect(financeiro).toHaveProperty(campo)
    }
    expect(financeiro).not.toHaveProperty('totalClientesAtivos')
  })

  it('podeLerFinanceiro espelha canReadFinanceiro (perfil ou tela concedida)', () => {
    expect(podeLerFinanceiro({ perfil: 'admin' })).toBe(true)
    expect(podeLerFinanceiro({ perfil: 'financeiro' })).toBe(true)
    for (const perfil of ['operacional', 'fiscal', 'leitura']) {
      expect(podeLerFinanceiro({ perfil })).toBe(false)
      expect(podeLerFinanceiro({ perfil, telas: ['hoje', 'financeiro'] })).toBe(true)
    }
    expect(podeLerFinanceiro({ perfil: 'leitura', telas: [] })).toBe(false)
  })
})

/** Firestore mínimo: registra as queries e os sets do batch. */
function firestoreFalso(dados: Record<string, Array<Record<string, unknown>>>) {
  const sets: Array<{ colecao: string; id: string; dados: Record<string, unknown>; opcoes?: unknown }> = []
  const filtros: Array<{ colecao: string; campo: string; op: string; valor: unknown }> = []
  function query(colecao: string, docs: Array<Record<string, unknown>>) {
    const q = {
      where(campo: string, op: string, valor: unknown) {
        filtros.push({ colecao, campo, op, valor })
        return q
      },
      count: () => ({ get: async () => ({ data: () => ({ count: docs.length }) }) }),
      get: async () => ({ docs: docs.map((d) => ({ data: () => d })) }),
    }
    return q
  }
  const db = {
    collection: (colecao: string) => ({
      ...query(colecao, dados[colecao] ?? []),
      doc: (id: string) => ({ colecao, id }),
    }),
    batch: () => ({
      set: (ref: { colecao: string; id: string }, d: Record<string, unknown>, opcoes?: unknown) =>
        sets.push({ ...ref, dados: d, opcoes }),
      commit: vi.fn(async () => undefined),
    }),
  }
  return { db: db as unknown as FirebaseFirestore.Firestore, sets, filtros }
}

describe('recalcularKpisTenant', () => {
  it('grava os dois docs sem merge, com o tenant em todas as queries', async () => {
    const { db, sets, filtros } = firestoreFalso({
      clientes: [{}, {}, {}],
      tarefas: [{}],
      competencias: [{ status: 'aberta' }, { status: 'concluida' }],
      // O falso não filtra: as duas queries de lançamentos veem os mesmos docs.
      lancamentos: [{ valor: 100 }, { valor: 50.5 }],
    })
    const r = await recalcularKpisTenant(
      db,
      { tenantId: 'ttrd', mes: 11, ano: 2026, atualizadoPorId: 'system', atualizadoPorNome: 'Sistema', origem: 'scheduler' },
      new Date('2026-11-06T15:00:00Z'),
    )
    expect(r.id).toBe('ttrd_2026_11')
    expect(r.operacional).toMatchObject({ totalClientesAtivos: 3, tarefasPendentes: 1, compCounts: { aberta: 1, concluida: 1 } })
    expect(r.financeiro).toMatchObject({ vencendoCount: 2, somaVencendo: 150.5, atrasadosCount: 2, somaAtrasados: 150.5 })

    expect(sets.map((s) => s.colecao).sort()).toEqual([COLECAO_KPIS, COLECAO_KPIS_FINANCEIRO].sort())
    for (const s of sets) {
      expect(s.id).toBe('ttrd_2026_11')
      expect(s.opcoes).toBeUndefined() // set sem merge apaga somas antigas do doc operacional
      expect(s.dados).toHaveProperty('atualizadoEm')
    }
    const op = sets.find((s) => s.colecao === COLECAO_KPIS)!
    for (const campo of CAMPOS_KPIS_FINANCEIROS) expect(op.dados).not.toHaveProperty(campo)

    for (const colecao of ['clientes', 'tarefas', 'competencias', 'lancamentos']) {
      expect(filtros.some((f) => f.colecao === colecao && f.campo === 'tenantId' && f.valor === 'ttrd')).toBe(true)
    }
  })
})

describe('KPIs do Painel — tela', () => {
  const agora = new Date('2026-11-06T15:00:00Z')

  it('lê Timestamp, {seconds}, ISO e Date', () => {
    const d = new Date('2026-11-06T14:30:00Z')
    expect(dataAtualizacaoKpis({ toDate: () => d })).toEqual(d)
    expect(dataAtualizacaoKpis({ seconds: d.getTime() / 1000 })).toEqual(d)
    expect(dataAtualizacaoKpis(d.toISOString())).toEqual(d)
    expect(dataAtualizacaoKpis(d)).toEqual(d)
    expect(dataAtualizacaoKpis(undefined)).toBeNull()
    expect(dataAtualizacaoKpis('lixo')).toBeNull()
  })

  it('desatualizado: mais de 1 h ou sem data', () => {
    expect(kpisDesatualizados(new Date(agora.getTime() - 59 * 60_000), agora)).toBe(false)
    expect(kpisDesatualizados(new Date(agora.getTime() - 61 * 60_000), agora)).toBe(true)
    expect(kpisDesatualizados(null, agora)).toBe(true)
  })

  it('rótulo "atualizado há…"', () => {
    const ha = (min: number) => new Date(agora.getTime() - min * 60_000)
    expect(rotuloAtualizacaoKpis(ha(0), agora)).toBe('Atualizado agora')
    expect(rotuloAtualizacaoKpis(ha(12), agora)).toBe('Atualizado há 12 min')
    expect(rotuloAtualizacaoKpis(ha(125), agora)).toBe('Atualizado há 2 h')
    expect(rotuloAtualizacaoKpis(ha(60 * 24 * 3), agora)).toBe('Atualizado há 3 dias')
    expect(rotuloAtualizacaoKpis(null, agora)).toBe('Atualização desconhecida')
  })
})
