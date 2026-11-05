import { describe, expect, it } from 'vitest'
import {
  ERRO_TOMADOR_IGUAL_PRESTADOR,
  documentoValido,
  ibgeValido,
  mesmoDocumento,
  somenteDigitos,
  validarTomador,
} from '@/features/tomadores/validacao'

const PRESTADOR_CNPJ = '11222333000181'
const TOMADOR_CNPJ = '11444777000161'
const TOMADOR_CPF = '52998224725'

function entrada(over: Partial<Parameters<typeof validarTomador>[0]> = {}) {
  return {
    cpfCnpj: TOMADOR_CNPJ,
    razaoSocial: 'PADARIA CENTRAL LTDA',
    prestadorCpfCnpj: PRESTADOR_CNPJ,
    ...over,
  }
}

describe('documentoValido', () => {
  it('aceita CPF e CNPJ válidos, com ou sem máscara', () => {
    expect(documentoValido('11.222.333/0001-81')).toBe(true)
    expect(documentoValido('529.982.247-25')).toBe(true)
  })

  it('recusa dígito verificador errado e comprimento fora de 11/14', () => {
    expect(documentoValido('11222333000180')).toBe(false)
    expect(documentoValido('123')).toBe(false)
    expect(documentoValido('')).toBe(false)
  })
})

describe('mesmoDocumento — a comparação que evita a nota para si mesmo', () => {
  it('ignora máscara: é o mesmo documento em formatos diferentes', () => {
    expect(mesmoDocumento('11.222.333/0001-81', '11222333000181')).toBe(true)
  })

  it('dois vazios não são "o mesmo documento"', () => {
    // Sem isto, cliente sem CNPJ cadastrado bloquearia todo tomador sem CNPJ —
    // dois campos em branco virariam "prestador == tomador".
    expect(mesmoDocumento('', '')).toBe(false)
  })
})

describe('validarTomador', () => {
  it('aceita um tomador completo e diferente do prestador', () => {
    expect(validarTomador(entrada())).toEqual([])
  })

  it('recusa tomador igual ao prestador — o bug que originou o módulo', () => {
    const erros = validarTomador(entrada({ cpfCnpj: PRESTADOR_CNPJ }))
    expect(erros).toContain(ERRO_TOMADOR_IGUAL_PRESTADOR)
  })

  it('recusa igual ao prestador mesmo com máscara diferente', () => {
    const erros = validarTomador(entrada({ cpfCnpj: '11.222.333/0001-81' }))
    expect(erros).toContain(ERRO_TOMADOR_IGUAL_PRESTADOR)
  })

  it('recusa CPF/CNPJ já cadastrado na carteira deste cliente', () => {
    const erros = validarTomador(
      entrada({ documentosDaCarteira: new Map([[TOMADOR_CNPJ, 'tom-1']]) })
    )
    expect(erros).toEqual(['Este CPF/CNPJ já está na carteira deste cliente.'])
  })

  it('na edição, o próprio documento não conta como duplicata', () => {
    const erros = validarTomador(
      entrada({ documentosDaCarteira: new Map([[TOMADOR_CNPJ, 'tom-1']]), idAtual: 'tom-1' })
    )
    expect(erros).toEqual([])
  })

  it('exige razão social e recusa documento inválido', () => {
    const erros = validarTomador(entrada({ razaoSocial: '  ', cpfCnpj: '11222333000180' }))
    expect(erros).toHaveLength(2)
    expect(erros[0]).toMatch(/razão social/i)
    expect(erros[1]).toMatch(/inválido/i)
  })

  it('recusa razão social acima do limite que as regras aceitam', () => {
    // Passar de 200 caracteres seria negado pelo firestore.rules com
    // permission-denied — mensagem que não diz o que corrigir.
    const erros = validarTomador(entrada({ razaoSocial: 'A'.repeat(201) }))
    expect(erros).toEqual(['Nome / razão social passa de 200 caracteres.'])
  })

  it('aceita CPF de pessoa física como tomador', () => {
    expect(validarTomador(entrada({ cpfCnpj: TOMADOR_CPF }))).toEqual([])
  })

  it('e-mail vazio não é erro; e-mail malformado é', () => {
    expect(validarTomador(entrada({ email: '' }))).toEqual([])
    expect(validarTomador(entrada({ email: 'sem-arroba' }))).toEqual(['E-mail do tomador inválido.'])
  })
})

describe('ibgeValido', () => {
  it('vazio passa (opcional no cadastro), 7 dígitos passa, resto não', () => {
    expect(ibgeValido('')).toBe(true)
    expect(ibgeValido('3550308')).toBe(true)
    expect(ibgeValido('35503')).toBe(false)
  })
})

describe('somenteDigitos', () => {
  it('remove máscara e trata nulo', () => {
    expect(somenteDigitos('11.222.333/0001-81')).toBe('11222333000181')
    expect(somenteDigitos(null)).toBe('')
  })
})
