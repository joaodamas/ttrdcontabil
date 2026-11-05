import { describe, expect, it } from 'vitest'
import {
  MUNICIPIOS, NBS, SERVICOS_NACIONAIS, buscarOpcoes, opcoesDoTipo, INDICADOR_OPERACAO, PAISES,
  campoLeiaute, regrasDoCampo, incidenciaDoServico, CST_IBSCBS, classificacoesIbsCbs,
} from '@/lib/nfse-dominios'

describe('catálogo oficial da NFS-e Nacional', () => {
  it('traz as listas dos anexos oficiais', () => {
    expect(SERVICOS_NACIONAIS.length).toBeGreaterThan(300)
    expect(NBS.length).toBeGreaterThan(1000)
    expect(MUNICIPIOS.length).toBe(5570)
    expect(PAISES.length).toBeGreaterThan(200)
    expect(INDICADOR_OPERACAO.length).toBeGreaterThan(20)
  })

  it('acha os códigos da nota real da JP Project', () => {
    expect(buscarOpcoes(SERVICOS_NACIONAIS, '01.02.01')[0]).toMatchObject({ codigo: '010201', descricao: 'Programação.' })
    expect(buscarOpcoes(NBS, '1.1501.10.00')[0].descricao).toMatch(/consultoria em tecnologia da informação/i)
    expect(buscarOpcoes(MUNICIPIOS, 'cajamar')[0]).toMatchObject({ codigo: '3509205', rotulo: 'Cajamar/SP' })
  })

  it('busca ignora acento, caixa e pontuação', () => {
    expect(buscarOpcoes(SERVICOS_NACIONAIS, 'programacao').some((o) => o.codigo === '010201')).toBe(true)
    expect(buscarOpcoes(SERVICOS_NACIONAIS, '010201')[0].codigo).toBe('010201')
    expect(buscarOpcoes(MUNICIPIOS, 'sao paulo sp').some((o) => o.codigo === '3550308')).toBe(true)
  })

  it('campos codificados do XSD vêm com descrição oficial', () => {
    expect(opcoesDoTipo('TSTribISSQN').map((o) => o.descricao)).toEqual(['Operação tributável', 'Imunidade', 'Exportação de serviço', 'Não Incidência'])
    expect(opcoesDoTipo('TSRegEspTrib').find((o) => o.codigo === '6')?.descricao).toBe('Sociedade de Profissionais')
  })

  it('traz descrição e regras de rejeição de cada campo (Anexo I)', () => {
    expect(campoLeiaute('infDPS/serv/cServ/cNBS')?.ocorrencia).toBe('0-1')
    expect(regrasDoCampo('infDPS/serv/cServ/cNBS').map((r) => r.codigo)).toContain('E0316')
    expect(regrasDoCampo('infDPS/serv/cServ/cTribNac').map((r) => r.codigo)).toContain('E0310')
  })

  it('diz onde o ISS incide e o grupo obrigatório por serviço', () => {
    expect(incidenciaDoServico('01.02.01')).toMatchObject({ incidencia: ['EP'], grupoObrigatorio: null })
    expect(incidenciaDoServico('070201')).toMatchObject({ incidencia: ['LP'], grupoObrigatorio: 'obra' })
  })

  it('lista CST e cClassTrib do IBS/CBS válidos para NFS-e', () => {
    expect(CST_IBSCBS.map((c) => c.codigo)).toContain('000')
    const integrais = classificacoesIbsCbs('2026-11-05', '000').map((c) => c.codigo)
    expect(integrais).toContain('000001')
  })
})

