import { describe, expect, it } from 'vitest'
import { CINDOP_PADRAO, INDICADOR_OPERACAO, cIndOpExigeImovel } from '@/lib/nfse-dominios'
import { mapearIbsCbs } from '../../functions/src/nfse/nacional/mapeamento'
import { traduzirErrosSefin } from '../../functions/src/nfse/nacional/erros'

describe('indicador de operação de bem imóvel (E0932)', () => {
  it('fica fora da lista e 100301 vem primeiro', () => {
    expect(INDICADOR_OPERACAO.some((o) => o.codigo.startsWith('02'))).toBe(false)
    expect(INDICADOR_OPERACAO[0].codigo).toBe(CINDOP_PADRAO)
    expect(cIndOpExigeImovel('020101')).toBe(true)
    expect(cIndOpExigeImovel('100301')).toBe(false)
  })

  it('é recusado antes do envio, com orientação', () => {
    expect(() => mapearIbsCbs({ ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '020101' }, {}))
      .toThrow(/100301/)
    expect(mapearIbsCbs({ ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '100301' }, {}))
      .toEqual({ cIndOp: '100301', indDest: 0, cst: '000', cClassTrib: '000001' })
  })

  it('a rejeição E0932 da Sefin é traduzida', () => {
    const t = traduzirErrosSefin([{ codigo: 'E0932', descricao: 'É obrigatório o grupo de informações relativo ao imóvel' }], { municipio: 'Cajamar' })
    expect(t.erro).toMatch(/bem imóvel/)
    expect(t.erro).toMatch(/100301/)
    expect(t.codigoErro).toBe('E0932')
  })
})
