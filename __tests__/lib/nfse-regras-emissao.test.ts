// @vitest-environment node
/**
 * Regras puras da orquestração da emissão (2026-11-06): normalizador único,
 * trava do rascunho, status após consulta, motivo de cancelamento, gate do
 * Ambiente Nacional, IM opcional, escape do e-mail e ids do lote.
 */
import { describe, expect, it } from 'vitest'

import { dadosRascunhoDoInput, normalizarRascunho } from '../../functions/src/nfse/normalizar-rascunho'
import {
  TRAVA_EMISSAO_MS, avaliarTrava, chaveIdempotenciaValida, idRascunhoEmissaoDireta,
  statusAposConsulta, validarMotivoCancelamento,
} from '../../functions/src/nfse/regras-emissao'
import { producaoNacionalLiberada } from '../../functions/src/nfse/provedor'
import { validarPayloadFiscal } from '../../functions/src/nfse/validacao'
import { xmlIndicaCancelamento } from '../../functions/src/nfse/provedores/nacional'
import { compactarXml } from '../../functions/src/nfse/nacional/ambiente'
import { escapeHtml, tableHtml } from '../../functions/src/email/mailer'
import { idsDoLote } from '../../functions/src/nfse/emitir-lote'
import { severidadeDaFalha } from '../../functions/src/nfse/log-emissao'
import type { ConfigFiscalCliente, EmitirNfseInput } from '../../functions/src/nfse/types'

const inputCompleto: EmitirNfseInput = {
  clienteId: 'c1',
  competenciaId: 'comp1',
  dataCompetencia: '2026-10-01',
  tomador: {
    razaoSocial: 'Tomador Ltda',
    cpfCnpj: '11444777000161',
    email: 'fin@tomador.com.br',
    endereco: { cep: '06454000', logradouro: 'Al. Rio Negro', numero: '500', bairro: 'Alphaville', municipioIbge: '3505708', uf: 'SP' },
  },
  servico: {
    discriminacao: 'Honorários de OUTUBRO/2026',
    descricaoModelo: 'Honorários de {{MES_ANO_COMPETENCIA}}',
    codigoServico: '1719',
    itemListaServico: '17.19',
    cnae: '6920601',
    valorServico: 1500.5,
    aliquota: 2,
    issRetido: true,
    valorDeducoes: 10,
    codigoTributacaoNacional: '171901',
    codigoNbs: '115011000',
    municipioPrestacao: '3550308',
    informacoesComplementares: 'Banco 001 ag 1234',
    ibsCbsCst: '000',
    ibsCbsClassTrib: '000001',
    ibsCbsIndOp: '100301',
  },
}

describe('normalizador único rascunho ↔ input (M7)', () => {
  it('ida e volta preserva TODOS os campos da nota', () => {
    const dados = dadosRascunhoDoInput(inputCompleto)
    const volta = normalizarRascunho('r1', { clienteId: 'c1', competenciaId: 'comp1', dados })
    expect(volta).toEqual({ ...inputCompleto, rascunhoId: 'r1' })
  })

  it('dados gravados não têm undefined (Firestore recusa)', () => {
    const dados = dadosRascunhoDoInput({ clienteId: 'c1', tomador: { razaoSocial: 'T', cpfCnpj: '1' }, servico: { discriminacao: 'x', codigoServico: '1', valorServico: 1, issRetido: false } })
    expect(Object.values(dados).some((v) => v === undefined)).toBe(false)
  })

  it('formato antigo aninhado (dados.tomador/dados.servico) também traz cTribNac, NBS, IBS/CBS e competência', () => {
    const r = normalizarRascunho('r2', {
      clienteId: 'c1',
      dados: {
        tomador: { razaoSocial: 'Antigo', cpfCnpj: '11.444.777/0001-61' },
        servico: { discriminacao: 'Serviço', codigoServico: '1719', valorServico: '200', issRetido: 0, codigoNbs: '115011000', codigoTributacaoNacional: '171901', ibsCbsCst: '000' },
        dataCompetencia: '2026-09-01',
        numeroRps: '7',
        serieRps: '1',
      },
    })
    expect(r).toMatchObject({
      rascunhoId: 'r2',
      tomador: { razaoSocial: 'Antigo', cpfCnpj: '11444777000161' },
      servico: { valorServico: 200, issRetido: false, codigoNbs: '115011000', codigoTributacaoNacional: '171901', ibsCbsCst: '000' },
      dataCompetencia: '2026-09-01',
      numeroRps: '7',
      serieRps: '1',
    })
  })

  it('rascunho do cron (formato plano com endereço parcialmente nulo) vira input limpo', () => {
    const r = normalizarRascunho('r3', {
      clienteId: 'c1', competenciaId: null,
      dados: { tomadorNome: 'Cron', tomadorCpfCnpj: '11444777000161', tomadorEmail: null, tomadorEndereco: { cep: null, municipioIbge: '3505708', uf: 'SP' }, descricaoServico: 'D', codigoServico: '1719', valorServico: 10, aliquota: null, issRetido: false },
    })
    expect(r.tomador.endereco).toEqual({ municipioIbge: '3505708', uf: 'SP' })
    expect(r.competenciaId).toBeUndefined()
    expect(r.servico.aliquota).toBeUndefined()
    expect('email' in r.tomador).toBe(false)
  })
})

describe('trava do rascunho', () => {
  const agora = 1_000_000_000_000
  it('emitida nunca destrava; processando válido recusa; vencido pode ser assumido', () => {
    expect(avaliarTrava({ status: 'emitida' }, agora)).toEqual({ pode: false, motivo: 'emitida' })
    expect(avaliarTrava({ status: 'processando', travaExpiraEmMs: agora + 1 }, agora)).toEqual({ pode: false, motivo: 'processando' })
    expect(avaliarTrava({ status: 'processando', travaExpiraEmMs: agora - 1 }, agora)).toEqual({ pode: true, assumiuTravaVencida: true })
    expect(avaliarTrava({ status: 'erro_integracao' }, agora)).toEqual({ pode: true, assumiuTravaVencida: false })
  })
  it('legado sem travaExpiraEm usa 30 min desde atualizadoEm', () => {
    expect(avaliarTrava({ status: 'processando', atualizadoEmMs: agora - 29 * 60_000 }, agora).pode).toBe(false)
    expect(avaliarTrava({ status: 'processando', atualizadoEmMs: agora - 31 * 60_000 }, agora).pode).toBe(true)
  })
  it('validade da trava cobre o pior caso de uma emissão e fica abaixo da rotina de 15 min', () => {
    expect(TRAVA_EMISSAO_MS).toBeGreaterThan(150_000)
    expect(TRAVA_EMISSAO_MS).toBeLessThan(15 * 60_000)
  })
  it('id do rascunho da emissão direta é determinístico e a chave é validada', () => {
    expect(idRascunhoEmissaoDireta('abcdefghij0123456789')).toBe('emissao_abcdefghij0123456789')
    expect(chaveIdempotenciaValida('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(chaveIdempotenciaValida('curta')).toBe(false)
    expect(chaveIdempotenciaValida('../../x/y/zzzzzzzzzzzz')).toBe(false)
    expect(() => idRascunhoEmissaoDireta('x')).toThrow()
  })
})

describe('status após consulta (A3)', () => {
  it('nunca regride de cancelada', () => {
    expect(statusAposConsulta('cancelada', 'emitida')).toBe('cancelada')
    expect(statusAposConsulta('cancelada', undefined)).toBe('cancelada')
  })
  it('reflete cancelamento da Sefin e segura cancelamento pendente', () => {
    expect(statusAposConsulta('emitida', 'cancelada')).toBe('cancelada')
    expect(statusAposConsulta('cancelamento_pendente', 'emitida')).toBe('cancelamento_pendente')
    expect(statusAposConsulta('cancelamento_pendente', 'cancelada')).toBe('cancelada')
    expect(statusAposConsulta('emitida', 'emitida')).toBe('emitida')
  })
  it('detecta evento de cancelamento nos eventos da Sefin (premissa de formato)', () => {
    expect(xmlIndicaCancelamento({ eventos: [{ eventoXmlGZipB64: compactarXml('<infEvento><e101101><xDesc>Cancelamento</xDesc></e101101></infEvento>') }] })).toBe(true)
    expect(xmlIndicaCancelamento({ eventos: [{ tipoEvento: '105102' }] })).toBe(true)
    expect(xmlIndicaCancelamento({ eventos: [{ tipoEvento: '101103' }] })).toBe(false)
    // A chave de acesso (50 dígitos) contém "101101" no meio sem ser evento.
    expect(xmlIndicaCancelamento({ chaveAcesso: '35057082211222333000181000000101101726110000000001' })).toBe(false)
    expect(xmlIndicaCancelamento(null)).toBe(false)
  })
})

describe('cancelamento (B10)', () => {
  it('motivo de 15 a 255 caracteres', () => {
    expect(validarMotivoCancelamento('curto demais')).toMatch(/15/)
    expect(validarMotivoCancelamento('   quinze letras.  ')).toMatch(/15/)
    expect(validarMotivoCancelamento('Nota emitida em duplicidade')).toBeNull()
    expect(validarMotivoCancelamento('x'.repeat(256))).toMatch(/255/)
  })
})

describe('gate de produção do Ambiente Nacional (A4)', () => {
  it('exige SEMPRE a chave global; a config só pode bloquear', () => {
    expect(producaoNacionalLiberada({ producaoLiberada: true }, null)).toBe(false)
    expect(producaoNacionalLiberada({ producaoLiberada: true }, { producaoLiberada: false })).toBe(false)
    expect(producaoNacionalLiberada({}, { producaoLiberada: true })).toBe(true)
    expect(producaoNacionalLiberada({ producaoLiberada: false }, { producaoLiberada: true })).toBe(false)
    expect(producaoNacionalLiberada(null, { producaoLiberada: 'true' })).toBe(false)
  })
})

describe('inscrição municipal (M6)', () => {
  const config = (provedorNfse: ConfigFiscalCliente['provedorNfse']): ConfigFiscalCliente => ({
    clienteId: 'c1', municipioEmissor: 'Barueri', municipioIbge: '3505708', inscricaoMunicipal: '',
    regimeTributario: 'simples_nacional', optanteSimples: true, incentivadorCultural: false,
    itemListaServico: '17.19', aliquotaPadrao: 2, ambienteEmissao: 'homologacao', provedorNfse,
  })
  const prestador = { cnpj: '11222333000181', inscricaoMunicipal: '', razaoSocial: 'Prestador', municipioIbge: '3505708' }
  it('não é exigida (emissão só pelo Ambiente Nacional) — nem em config antiga com provedor da prefeitura', () => {
    expect(validarPayloadFiscal(inputCompleto, config('nacional'), prestador)).not.toContain('Inscrição municipal do prestador inválida.')
    expect(validarPayloadFiscal(inputCompleto, config('prefeitura'), prestador)).not.toContain('Inscrição municipal do prestador inválida.')
  })
  it('se preenchida no nacional, ainda precisa ser plausível', () => {
    expect(validarPayloadFiscal(inputCompleto, config('nacional'), { ...prestador, inscricaoMunicipal: 'x' })).toContain('Inscrição municipal do prestador inválida.')
  })
})

describe('e-mail de alertas (B12)', () => {
  it('escapa o que vem do banco', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'y\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
    const html = tableHtml('Título <b>', ['Cliente'], [['<img src=x onerror=alert(1)>']])
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<b>')
  })
})

describe('lote (M8)', () => {
  it('lê só ids — formato novo, antigo (itens[].rascunhoId) e sem repetição', () => {
    expect(idsDoLote({ rascunhoIds: ['a', 'b', 'a'] })).toEqual(['a', 'b'])
    expect(idsDoLote({ itens: [{ rascunhoId: 'x' }, { rascunhoId: 3 }, {}] as never })).toEqual(['x'])
    expect(idsDoLote({ rascunhoIds: ['ok', '../fora', ''] })).toEqual(['ok'])
    expect(idsDoLote(undefined)).toEqual([])
  })
})

describe('severidade do log de falha da emissão (alerta do Cloud Monitoring)', () => {
  const httpsError = (code: string, details?: unknown) => Object.assign(new Error('x'), { code, httpErrorCode: { status: 400 }, details })
  it('bloqueio da pré-validação e erro do usuário = WARNING; falha real = ERROR', () => {
    expect(severidadeDaFalha(httpsError('failed-precondition', { codigo: 'PRE_VALIDACAO' }))).toBe('WARNING')
    expect(severidadeDaFalha(httpsError('invalid-argument'))).toBe('WARNING')
    expect(severidadeDaFalha(httpsError('permission-denied'))).toBe('WARNING')
    expect(severidadeDaFalha(httpsError('already-exists'))).toBe('WARNING')
    expect(severidadeDaFalha(httpsError('internal'))).toBe('ERROR')
    expect(severidadeDaFalha(new Error('tempo esgotado (90 s)'))).toBe('ERROR')
    expect(severidadeDaFalha(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }))).toBe('ERROR')
  })
})
