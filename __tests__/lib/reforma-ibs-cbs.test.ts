import { describe, expect, it } from 'vitest'
import { buildIbsCbs } from '../../functions/src/nfse/provedores/spedy'

// O grupo `ibsCbs` da NFS-e (Spedy, ServiceInvoiceIbsCbsDto). A regra que
// importa: sem CST + classificação válidos o grupo NÃO vai no payload, porque a
// Spedy então aplica a Regra de Tributação do painel. Meio grupo é rejeição na
// prefeitura; nenhum grupo é fallback silencioso — e fallback é o certo aqui.

describe('buildIbsCbs — quando o grupo entra no payload', () => {
  it('omite quando não há nada configurado', () => {
    expect(buildIbsCbs(undefined, undefined)).toBeUndefined()
  })

  it('usa o padrão do cliente quando a nota não traz nada', () => {
    expect(buildIbsCbs(undefined, { cst: 0, classification: 200001 })).toEqual({
      cst: 0,
      classification: 200001,
    })
  })

  it('a nota sobrescreve o padrão do cliente', () => {
    const resultado = buildIbsCbs(
      { cst: 200, classification: 410001 },
      { cst: 0, classification: 200001 },
    )
    expect(resultado).toEqual({ cst: 200, classification: 410001 })
  })

  it('mantém CST zero — 0 é enquadramento válido, não "vazio"', () => {
    expect(buildIbsCbs({ cst: 0, classification: 1 }, undefined)).toEqual({
      cst: 0,
      classification: 1,
    })
  })
})

describe('buildIbsCbs — dado incompleto não vira nota rejeitada', () => {
  it('omite quando falta a classificação', () => {
    expect(buildIbsCbs({ cst: 0 } as never, undefined)).toBeUndefined()
  })

  it('omite quando falta o CST', () => {
    expect(buildIbsCbs({ classification: 200001 } as never, undefined)).toBeUndefined()
  })

  it('omite quando o valor não vira número', () => {
    expect(buildIbsCbs({ cst: 'abc', classification: 1 } as never, undefined)).toBeUndefined()
    expect(buildIbsCbs({ cst: 0, classification: NaN }, undefined)).toBeUndefined()
  })
})

describe('buildIbsCbs — dado legado em string vira inteiro', () => {
  // ProdutoRecord.ibsCbsCst e cClassTrib foram cadastrados como string; a API
  // da Spedy exige integer. Coagir aqui evita que dado antigo derrube a emissão.
  it('converte string para número', () => {
    expect(buildIbsCbs({ cst: '000', classification: ' 200001 ' } as never, undefined)).toEqual({
      cst: 0,
      classification: 200001,
    })
  })

  it('trunca decimal em vez de mandar fracionado', () => {
    expect(buildIbsCbs({ cst: 1.9, classification: 200001.4 }, undefined)).toEqual({
      cst: 1,
      classification: 200001,
    })
  })
})

describe('buildIbsCbs — campos opcionais só aparecem quando informados', () => {
  it('não inventa operationIndicatorCode nem isPersonalUse', () => {
    const resultado = buildIbsCbs({ cst: 0, classification: 1 }, undefined)
    expect(resultado).not.toHaveProperty('operationIndicatorCode')
    expect(resultado).not.toHaveProperty('isPersonalUse')
  })

  it('preserva isPersonalUse false — false é resposta, não ausência', () => {
    const resultado = buildIbsCbs(
      { cst: 0, classification: 1, isPersonalUse: false, operationIndicatorCode: '01' },
      undefined,
    )
    expect(resultado).toEqual({
      cst: 0,
      classification: 1,
      operationIndicatorCode: '01',
      isPersonalUse: false,
    })
  })
})
