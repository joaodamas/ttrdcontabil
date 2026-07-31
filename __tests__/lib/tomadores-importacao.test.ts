import { describe, expect, it } from 'vitest'
import {
  chaveCarteira,
  mapearParesDaPlanilha,
  validarTomadorRow,
  type ContextoImportacaoTomadores,
  type RawRow,
} from '@/features/tomadores/importacao'
import { ERRO_TOMADOR_IGUAL_PRESTADOR } from '@/features/tomadores/validacao'
import type { PrestadorResumo } from '@/features/tomadores/types'

const PRESTADOR_CNPJ = '11222333000181'
const TOMADOR_CNPJ = '11444777000161'

const PRESTADOR: PrestadorResumo = {
  id: 'cli-1',
  razaoSocial: 'ACME CONTABILIDADE LTDA',
  cpfCnpj: PRESTADOR_CNPJ,
}

const PRESTADORES = new Map([[PRESTADOR_CNPJ, PRESTADOR]])

function linha(over: Partial<RawRow> = {}): RawRow {
  return {
    cpfCnpjPrestador: '11.222.333/0001-81',
    cpfCnpj: '11.444.777/0001-61',
    razaoSocial: 'PADARIA CENTRAL LTDA',
    municipio: 'São Paulo',
    uf: 'SP',
    ...over,
  }
}

function contexto(over: Partial<ContextoImportacaoTomadores> = {}): ContextoImportacaoTomadores {
  return {
    prestadoresPorDocumento: PRESTADORES,
    carteiraExistente: new Map(),
    paresNaPlanilha: new Map(),
    ...over,
  }
}

describe('validarTomadorRow', () => {
  it('linha completa vira payload pronto para gravar', () => {
    const resultado = validarTomadorRow(linha({ cep: '01310-100', email: 'nf@padaria.com.br' }), 1, contexto())

    expect(resultado.erros).toEqual([])
    expect(resultado.clienteId).toBe('cli-1')
    // Dígitos, nunca a máscara: é o formato exigido pelas regras e o que o
    // conector envia à prefeitura.
    expect(resultado.payload.cpfCnpj).toBe(TOMADOR_CNPJ)
    expect(resultado.payload.ativo).toBe(true)
    expect(resultado.payload.endereco).toEqual({
      cep: '01310-100',
      municipio: 'São Paulo',
      uf: 'SP',
    })
  })

  it('linha sem endereço nenhum não grava mapa vazio', () => {
    const resultado = validarTomadorRow(
      linha({ municipio: '', uf: '' }),
      1,
      contexto()
    )
    expect(resultado.payload.endereco).toBeUndefined()
  })

  it('recusa a linha em que o tomador é o próprio prestador', () => {
    const resultado = validarTomadorRow(linha({ cpfCnpj: PRESTADOR_CNPJ }), 3, contexto())
    expect(resultado.erros).toContain(ERRO_TOMADOR_IGUAL_PRESTADOR)
  })

  it('recusa prestador que não é cliente cadastrado', () => {
    const resultado = validarTomadorRow(linha({ cpfCnpjPrestador: '11.444.777/0001-61' }), 2, contexto())
    expect(resultado.erros).toContain('CNPJ do prestador não corresponde a nenhum cliente cadastrado')
    expect(resultado.clienteId).toBeUndefined()
  })

  it('recusa tomador que já está na carteira daquele prestador', () => {
    const resultado = validarTomadorRow(
      linha(),
      1,
      contexto({ carteiraExistente: new Map([[chaveCarteira('cli-1', TOMADOR_CNPJ), 'tom-9']]) })
    )
    expect(resultado.erros).toContain('Este tomador já está na carteira deste prestador')
  })

  it('aponta a primeira ocorrência quando a planilha repete o par', () => {
    const rows = [linha(), linha()]
    const pares = mapearParesDaPlanilha(rows, PRESTADORES)
    const segunda = validarTomadorRow(rows[1], 2, contexto({ paresNaPlanilha: pares }))

    expect(segunda.erros).toContain('Tomador repetido na planilha (linha 1)')
    // A primeira ocorrência continua importável — recusar as duas perderia o
    // cadastro inteiro por causa de uma linha copiada a mais.
    const primeira = validarTomadorRow(rows[0], 1, contexto({ paresNaPlanilha: pares }))
    expect(primeira.erros).toEqual([])
  })

  it('o mesmo CNPJ pode ser tomador de dois prestadores diferentes', () => {
    const outro: PrestadorResumo = { id: 'cli-2', razaoSocial: 'OUTRA LTDA', cpfCnpj: '11444777000161' }
    const prestadores = new Map([[PRESTADOR_CNPJ, PRESTADOR], ['11444777000161', outro]])
    const carteira = new Map([[chaveCarteira('cli-2', TOMADOR_CNPJ), 'tom-1']])

    const resultado = validarTomadorRow(
      linha(),
      1,
      contexto({ prestadoresPorDocumento: prestadores, carteiraExistente: carteira })
    )
    expect(resultado.erros).toEqual([])
  })

  it('acusa UF inexistente, e-mail inválido e IBGE fora de 7 dígitos', () => {
    const resultado = validarTomadorRow(
      linha({ uf: 'XX', email: 'sem-arroba', municipioIbge: '123' }),
      1,
      contexto()
    )
    expect(resultado.erros).toEqual([
      'E-mail inválido',
      'UF "XX" não existe',
      'Código IBGE precisa ter 7 dígitos',
    ])
  })
})
