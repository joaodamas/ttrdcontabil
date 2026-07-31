import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  caminhoArquivoFiscal,
  chaveEventoWebhook,
  competenciaDaNota,
  conferirCredencialWebhook,
  ehStatusTerminal,
  extrairEventoSpedy,
  extrairTotaisIbsCbs,
  mapearStatusSpedy,
} from '../../functions/src/nfse/provedores/spedy-evento'

describe('mapearStatusSpedy — status desconhecido nunca vira nota emitida', () => {
  it('traduz os status conhecidos da Spedy', () => {
    expect(mapearStatusSpedy('authorized')).toBe('emitida')
    expect(mapearStatusSpedy('cancelled')).toBe('cancelada')
    expect(mapearStatusSpedy('canceled')).toBe('cancelada')
    expect(mapearStatusSpedy('denied')).toBe('rejeitada')
    expect(mapearStatusSpedy('failed')).toBe('rejeitada')
    expect(mapearStatusSpedy('enqueued')).toBe('processando')
    expect(mapearStatusSpedy('inContingent')).toBe('processando')
  })

  it('não se importa com caixa nem espaço em volta', () => {
    expect(mapearStatusSpedy(' Authorized ')).toBe('emitida')
  })

  it('status novo ou vazio vira "erro", não "emitida"', () => {
    // É o ponto mais perigoso do webhook: um status renomeado do lado da Spedy
    // não pode virar check verde em cima de nota fiscal real.
    expect(mapearStatusSpedy('partiallyAuthorized')).toBe('erro')
    expect(mapearStatusSpedy('')).toBe('erro')
    expect(mapearStatusSpedy(undefined)).toBe('erro')
    expect(mapearStatusSpedy(null)).toBe('erro')
  })

  it('só emitida/cancelada/rejeitada são terminais', () => {
    expect(ehStatusTerminal('emitida')).toBe(true)
    expect(ehStatusTerminal('cancelada')).toBe(true)
    expect(ehStatusTerminal('rejeitada')).toBe(true)
    expect(ehStatusTerminal('processando')).toBe(false)
    expect(ehStatusTerminal('erro')).toBe(false)
  })
})

describe('extrairEventoSpedy — aceita os envelopes conhecidos', () => {
  it('lê a nota crua no corpo', () => {
    const evento = extrairEventoSpedy({
      id: 'inv_123',
      status: 'authorized',
      number: 4821,
      integrationId: 'rascunho-abc',
      authorization: { protocol: 'PROTO-9' },
    })
    expect(evento).toMatchObject({
      invoiceId: 'inv_123',
      status: 'authorized',
      statusLocal: 'emitida',
      numeroNfse: '4821',
      integrationId: 'rascunho-abc',
      protocolo: 'PROTO-9',
      recurso: 'service-invoices',
    })
  })

  it('lê o envelope { event, data }', () => {
    const evento = extrairEventoSpedy({
      event: 'serviceInvoice.statusChanged',
      data: { id: 'inv_9', status: 'cancelled' },
    })
    expect(evento?.invoiceId).toBe('inv_9')
    expect(evento?.statusLocal).toBe('cancelada')
    expect(evento?.tipoEvento).toBe('serviceInvoice.statusChanged')
  })

  it('reconhece o recurso quando o evento diz de qual documento é', () => {
    const evento = extrairEventoSpedy({ resource: 'product-invoices', data: { id: 'inv_1', status: 'authorized' } })
    expect(evento?.recurso).toBe('product-invoices')
  })

  it('sem id da nota não há evento', () => {
    expect(extrairEventoSpedy({ status: 'authorized' })).toBeNull()
    expect(extrairEventoSpedy(null)).toBeNull()
    expect(extrairEventoSpedy('texto')).toBeNull()
  })
})

describe('extrairTotaisIbsCbs — o valor da reforma que era descartado', () => {
  it('lê os oito campos de dentro de totals', () => {
    const totais = extrairTotaisIbsCbs({
      id: 'x',
      totals: {
        ibsCbsBaseTax: 1000,
        ibsStateRate: 0.001,
        ibsCityRate: 0.0002,
        cbsRate: 0.009,
        ibsStateAmount: 1,
        ibsCityAmount: 0.2,
        ibsAmount: 1.2,
        cbsAmount: 9,
        invoiceAmount: 1000,
      },
    })
    expect(totais).toEqual({
      ibsCbsBaseTax: 1000,
      ibsStateRate: 0.001,
      ibsCityRate: 0.0002,
      cbsRate: 0.009,
      ibsStateAmount: 1,
      ibsCityAmount: 0.2,
      ibsAmount: 1.2,
      cbsAmount: 9,
    })
  })

  it('aceita número em string, como a API às vezes devolve', () => {
    expect(extrairTotaisIbsCbs({ totals: { cbsAmount: '9.50' } })).toEqual({ cbsAmount: 9.5 })
  })

  it('preserva zero — zero é imposto zero, não "não veio"', () => {
    expect(extrairTotaisIbsCbs({ totals: { ibsAmount: 0 } })).toEqual({ ibsAmount: 0 })
  })

  it('nota sem nenhum campo devolve null, e não um objeto zerado', () => {
    expect(extrairTotaisIbsCbs({ id: 'x', total: { invoiceAmount: 100 } })).toBeNull()
    expect(extrairTotaisIbsCbs(null)).toBeNull()
  })
})

describe('chaveEventoWebhook — idempotência do reenvio da Spedy', () => {
  it('mesma nota e mesmo status geram a mesma chave', () => {
    const a = chaveEventoWebhook({ invoiceId: 'inv_1', status: 'authorized' })
    const b = chaveEventoWebhook({ invoiceId: 'inv_1', status: 'authorized' })
    expect(a).toBe(b)
  })

  it('a mesma nota em status diferentes precisa passar duas vezes', () => {
    const criada = chaveEventoWebhook({ invoiceId: 'inv_1', status: 'created' })
    const autorizada = chaveEventoWebhook({ invoiceId: 'inv_1', status: 'authorized' })
    expect(criada).not.toBe(autorizada)
  })

  it('não deixa caractere de caminho virar id de documento', () => {
    const chave = chaveEventoWebhook({ invoiceId: 'a/b', status: 'x/y' })
    expect(chave).not.toContain('/')
  })
})

describe('caminhoArquivoFiscal — guarda de 5 anos em nfse/{clienteId}/{ano}/{mes}', () => {
  it('monta o caminho que storage.rules já conhece', () => {
    expect(caminhoArquivoFiscal({ clienteId: 'cli1', ano: 2026, mes: 7, nome: '4821', extensao: 'xml' }))
      .toBe('nfse/cli1/2026/07/4821.xml')
  })

  it('não deixa um id inesperado escrever na pasta de outro cliente', () => {
    expect(caminhoArquivoFiscal({ clienteId: '../outro', ano: 2026, mes: 12, nome: 'a/../b', extensao: 'pdf' }))
      .toBe('nfse/outro/2026/12/ab.pdf')
  })

  it('recusa competência impossível em vez de gravar em pasta errada', () => {
    expect(() => caminhoArquivoFiscal({ clienteId: 'c', ano: 2026, mes: 13, nome: 'n', extensao: 'xml' })).toThrow()
    expect(() => caminhoArquivoFiscal({ clienteId: 'c', ano: 1900, mes: 1, nome: 'n', extensao: 'xml' })).toThrow()
    expect(() => caminhoArquivoFiscal({ clienteId: '///', ano: 2026, mes: 1, nome: 'n', extensao: 'xml' })).toThrow()
  })
})

describe('competenciaDaNota', () => {
  it('usa a data da nota quando ela existe', () => {
    expect(competenciaDaNota({ issuedOn: '2026-03-15T10:00:00' })).toEqual({ ano: 2026, mes: 3 })
  })

  it('cai no relógio só quando a Spedy não manda data', () => {
    const agora = new Date('2026-07-30T12:00:00')
    expect(competenciaDaNota({ id: 'x' }, agora)).toEqual({ ano: 2026, mes: 7 })
    expect(competenciaDaNota({ issuedOn: 'não é data' }, agora)).toEqual({ ano: 2026, mes: 7 })
  })
})

describe('conferirCredencialWebhook — endpoint público, fail-closed', () => {
  const corpo = Buffer.from(JSON.stringify({ id: 'inv_1', status: 'authorized' }))

  it('sem segredo configurado, recusa tudo', () => {
    // O caminho que mais importa: enquanto o secret não existir no Secret
    // Manager, o webhook não pode aceitar nada.
    expect(conferirCredencialWebhook({ segredo: undefined, token: 'qualquer' }))
      .toEqual({ ok: false, motivo: 'segredo_nao_configurado' })
    expect(conferirCredencialWebhook({ segredo: '   ', token: 'qualquer' }).ok).toBe(false)
  })

  it('recusa POST sem credencial nenhuma', () => {
    expect(conferirCredencialWebhook({ segredo: 's3cr3t' }))
      .toEqual({ ok: false, motivo: 'credencial_ausente' })
  })

  it('aceita o segredo compartilhado correto e recusa o errado', () => {
    expect(conferirCredencialWebhook({ segredo: 's3cr3t', token: 's3cr3t' }).ok).toBe(true)
    expect(conferirCredencialWebhook({ segredo: 's3cr3t', token: 's3cr3T' }))
      .toEqual({ ok: false, motivo: 'credencial_invalida' })
  })

  it('valida assinatura HMAC do corpo, com ou sem o prefixo sha256=', () => {
    const assinatura = createHmac('sha256', 's3cr3t').update(corpo).digest('hex')
    expect(conferirCredencialWebhook({ segredo: 's3cr3t', assinatura, corpoBruto: corpo }).ok).toBe(true)
    expect(conferirCredencialWebhook({ segredo: 's3cr3t', assinatura: `sha256=${assinatura}`, corpoBruto: corpo }).ok).toBe(true)
  })

  it('assinatura válida de OUTRO corpo não passa', () => {
    // É o que impede reaproveitar um POST capturado com payload trocado.
    const assinatura = createHmac('sha256', 's3cr3t').update(corpo).digest('hex')
    const adulterado = Buffer.from(JSON.stringify({ id: 'inv_1', status: 'authorized', number: 999 }))
    expect(conferirCredencialWebhook({ segredo: 's3cr3t', assinatura, corpoBruto: adulterado }))
      .toEqual({ ok: false, motivo: 'credencial_invalida' })
  })

  it('assinatura sem corpo bruto não passa', () => {
    expect(conferirCredencialWebhook({ segredo: 's3cr3t', assinatura: 'abc', corpoBruto: null }).ok).toBe(false)
  })
})
