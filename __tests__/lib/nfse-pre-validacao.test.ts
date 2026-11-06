/**
 * Motor único de pré-validação fiscal (functions/src/nfse/pre-validacao): cada
 * regra tem um caso que dispara e o caso-base (nota correta) que passa limpo.
 */
import { describe, expect, it } from 'vitest'
import {
  avisosDe, bloqueiosDe, cnpjDoTitularCertificado, formatarNbs, hojeBrasilia, nbsCorrelacionadas,
  preValidarConfigFiscal, preValidarNfse, textoBloqueios, type EntradaPreValidacao,
} from '../../functions/src/nfse/pre-validacao'

const HOJE = '2026-11-06'
type Mut = (e: EntradaPreValidacao) => void

function base(): EntradaPreValidacao {
  return {
    hoje: HOJE,
    prestador: { cnpj: '11222333000181', razaoSocial: 'Prestador Teste Ltda', inscricaoMunicipal: '12345', municipioIbge: '3505708' },
    config: {
      municipioEmissor: 'Barueri', municipioIbge: '3505708', inscricaoMunicipal: '12345',
      regimeTributario: 'simples_nacional', optanteSimples: true, naturezaOperacao: '1',
      itemListaServico: '17.19', codigoServicoPadrao: '1719', aliquotaPadrao: 2, ambienteEmissao: 'producao', provedorNfse: 'nacional',
      credenciais: { certificadoStoragePath: 'certificados/c1.pfx.b64', certTitular: 'PRESTADOR TESTE LTDA:11222333000181', certVencimento: '2027-06-30T00:00:00.000Z', certValido: true },
    },
    nota: {
      dataCompetencia: '2026-10-01',
      tomador: { razaoSocial: 'Tomador Ltda', cpfCnpj: '11444777000161', email: 'contato@tomador.com.br' },
      servico: {
        discriminacao: 'Serviços contábeis de outubro', codigoServico: '1719', itemListaServico: '17.19',
        valorServico: 1000, issRetido: false, codigoNbs: '1.1302.21.00',
        ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '100301',
      },
    },
  }
}

function rodar(mut?: Mut) {
  const e = base()
  mut?.(e)
  return preValidarNfse(e)
}
const srv = (e: EntradaPreValidacao) => e.nota.servico!
const tom = (e: EntradaPreValidacao) => e.nota.tomador!

describe('caso-base', () => {
  it('nota correta passa sem bloqueio nem aviso', () => {
    expect(rodar()).toEqual([])
  })
})

// [regra, mutação, severidade esperada, código Sefin esperado]
const CASOS: Array<[string, Mut, 'bloqueio' | 'aviso', string?]> = [
  // Prestador / regime / município / certificado
  ['prestador_cnpj', (e) => { e.prestador.cnpj = '11222333000180' }, 'bloqueio', 'E0080'],
  ['prestador_razao', (e) => { e.prestador.razaoSocial = 'X' }, 'bloqueio'],
  ['prestador_im', (e) => { e.prestador.inscricaoMunicipal = 'x' }, 'bloqueio'],
  ['ambiente', (e) => { e.config.ambienteEmissao = 'teste' as never }, 'bloqueio'],
  ['regime_ausente', (e) => { e.config.regimeTributario = '' as never; e.config.optanteSimples = false }, 'bloqueio'],
  ['regime_incoerente', (e) => { e.config.regimeTributario = 'lucro_presumido' }, 'bloqueio', 'E0160'],
  ['municipio_ibge', (e) => { e.prestador.municipioIbge = '9999999' }, 'bloqueio'],
  ['municipio_sem_emissor_nacional', (e) => { e.prestador.municipioIbge = '3525904'; e.config.municipioEmissor = 'Jundiaí' }, 'bloqueio', 'E0037'],
  ['certificado_ausente', (e) => { e.config.credenciais = {} }, 'bloqueio', 'E0714'],
  ['certificado_invalido', (e) => { (e.config.credenciais as Record<string, unknown>).certValido = false }, 'bloqueio', 'E1200'],
  ['certificado_vencido', (e) => { (e.config.credenciais as Record<string, unknown>).certVencimento = '2026-11-01T00:00:00Z' }, 'bloqueio', 'E1200'],
  ['certificado_vencendo', (e) => { (e.config.credenciais as Record<string, unknown>).certVencimento = '2026-11-15T00:00:00Z' }, 'aviso'],
  ['certificado_outro_cnpj', (e) => { (e.config.credenciais as Record<string, unknown>).certTitular = 'OUTRA EMPRESA:11444777000161' }, 'bloqueio', 'E0718'],
  ['certificado_outro_estabelecimento', (e) => { (e.config.credenciais as Record<string, unknown>).certTitular = 'PRESTADOR FILIAL:11222333000262' }, 'aviso', 'E0718'],
  // Serviço
  ['item_lista_ausente', (e) => { srv(e).itemListaServico = ''; e.config.itemListaServico = undefined }, 'bloqueio'],
  ['ctribnac_formato', (e) => { srv(e).codigoTributacaoNacional = '1719' }, 'bloqueio'],
  ['ctribnac_inexistente', (e) => { srv(e).codigoTributacaoNacional = '171999' }, 'bloqueio', 'E0310'],
  ['ctribnac_99', (e) => { srv(e).codigoTributacaoNacional = '990101' }, 'bloqueio'],
  ['ctribnac_exige_obra', (e) => { srv(e).codigoTributacaoNacional = '070201'; srv(e).codigoNbs = '' ; srv(e).ibsCbsCst = ''; srv(e).ibsCbsClassTrib = ''; srv(e).ibsCbsIndOp = '' }, 'bloqueio', 'E0370'],
  ['ctribnac_exige_evento', (e) => { srv(e).codigoTributacaoNacional = '120101'; srv(e).codigoNbs = ''; srv(e).ibsCbsCst = ''; srv(e).ibsCbsClassTrib = ''; srv(e).ibsCbsIndOp = '' }, 'bloqueio', 'E0390'],
  ['tomador_endereco_incidencia', (e) => { srv(e).codigoTributacaoNacional = '170501'; srv(e).codigoNbs = '' ; srv(e).ibsCbsCst = ''; srv(e).ibsCbsClassTrib = ''; srv(e).ibsCbsIndOp = '' }, 'bloqueio', 'E0234'],
  ['local_prestacao_incidencia', (e) => { srv(e).codigoTributacaoNacional = '110101'; srv(e).codigoNbs = ''; srv(e).ibsCbsCst = ''; srv(e).ibsCbsClassTrib = ''; srv(e).ibsCbsIndOp = '' }, 'aviso'],
  ['nbs_formato', (e) => { srv(e).codigoNbs = '1.1302' }, 'bloqueio', 'E0316'],
  ['nbs_inexistente', (e) => { srv(e).codigoNbs = '188888888' }, 'bloqueio', 'E0316'],
  ['nbs_incompativel', (e) => { srv(e).codigoNbs = '1.0101.11.00' }, 'bloqueio'],
  ['local_prestacao_ibge', (e) => { srv(e).municipioPrestacao = '9999999' }, 'bloqueio', 'E0302'],
  // IBS/CBS
  ['ibscbs_incompleto', (e) => { srv(e).ibsCbsIndOp = '' }, 'bloqueio'],
  ['ibscbs_antes_2026', (e) => { e.nota.dataCompetencia = '2025-12-01' }, 'bloqueio', 'E0850'],
  ['ibscbs_mei', (e) => { e.config.regimeTributario = 'mei'; e.config.optanteSimples = true }, 'aviso'],
  ['ibscbs_ausente_regime_normal', (e) => { e.config.regimeTributario = 'lucro_presumido'; e.config.optanteSimples = false; srv(e).ibsCbsCst = ''; srv(e).ibsCbsClassTrib = ''; srv(e).ibsCbsIndOp = '' }, 'aviso'],
  ['cindop_imovel', (e) => { srv(e).ibsCbsIndOp = '020101' }, 'bloqueio', 'E0932'],
  ['cindop_inexistente', (e) => { srv(e).ibsCbsIndOp = '999999' }, 'bloqueio', 'E0901'],
  ['cst_inexistente', (e) => { srv(e).ibsCbsCst = '999'; srv(e).ibsCbsClassTrib = '999001' }, 'bloqueio', 'E0958'],
  ['cclasstrib_cst', (e) => { srv(e).ibsCbsClassTrib = '200052' }, 'bloqueio', 'E0958'],
  ['cclasstrib_inexistente', (e) => { srv(e).ibsCbsClassTrib = '000099' }, 'bloqueio', 'E0958'],
  ['cclasstrib_vigencia', (e) => { srv(e).ibsCbsClassTrib = '000006'; e.nota.dataCompetencia = '2025-12-01' }, 'bloqueio', 'E0958'],
  ['cclasstrib_trib_regular', (e) => { srv(e).ibsCbsCst = '550'; srv(e).ibsCbsClassTrib = '550016' }, 'bloqueio', 'E0965'],
  ['ibscbs_sem_nbs', (e) => { srv(e).codigoNbs = '' }, 'bloqueio', 'E0322'],
  ['ibscbs_exige_tpoper', (e) => { srv(e).codigoTributacaoNacional = '171201'; srv(e).codigoNbs = '' }, 'bloqueio', 'E0903'],
  // Tributos
  ['aliquota_faixa', (e) => { srv(e).aliquota = -1 }, 'bloqueio'],
  ['aliquota_maxima', (e) => { srv(e).aliquota = 6 }, 'bloqueio', 'E0595'],
  ['aliquota_minima', (e) => { e.config.regimeTributario = 'lucro_presumido'; e.config.optanteSimples = false; srv(e).aliquota = 1 }, 'aviso'],
  ['natureza_nao_suportada', (e) => { e.config.naturezaOperacao = '3' }, 'bloqueio'],
  ['aliquota_simples_ausente', (e) => { e.config.aliquotaPadrao = undefined; e.config.aliquotaSimplesNacional = undefined }, 'bloqueio', 'E0712'],
  ['iss_retido_mei', (e) => { e.config.regimeTributario = 'mei'; srv(e).issRetido = true }, 'bloqueio', 'E0583'],
  ['iss_retido_imune', (e) => { e.config.naturezaOperacao = '4'; srv(e).issRetido = true }, 'bloqueio', 'E0580'],
  ['iss_retido_sem_aliquota', (e) => { srv(e).issRetido = true; srv(e).aliquota = 0 }, 'bloqueio', 'E0640'],
  ['iss_retido_pessoa_fisica', (e) => { srv(e).issRetido = true; tom(e).cpfCnpj = '52998224725' }, 'aviso'],
  ['mei_tributos_federais', (e) => { e.config.regimeTributario = 'mei'; srv(e).valorIr = 10 }, 'bloqueio', 'E0676'],
  ['piscofins_nao_suportado', (e) => { srv(e).valorPis = 5 }, 'bloqueio'],
  ['outras_retencoes', (e) => { srv(e).outrasRetencoes = 5 }, 'bloqueio'],
  ['retencao_valorIr', (e) => { srv(e).valorIr = 1000 }, 'bloqueio', 'E0700'],
  ['retencao_valorInss', (e) => { srv(e).valorInss = 2000 }, 'bloqueio', 'E0699'],
  // Tomador
  ['tomador_ausente', (e) => { e.nota.tomador = null }, 'bloqueio'],
  ['tomador_documento', (e) => { tom(e).cpfCnpj = '11444777000160' }, 'bloqueio', 'E0188'],
  ['tomador_igual_prestador', (e) => { tom(e).cpfCnpj = '11.222.333/0001-81' }, 'bloqueio', 'E0202'],
  ['tomador_nome', (e) => { tom(e).razaoSocial = '' }, 'bloqueio'],
  ['tomador_email', (e) => { tom(e).email = 'sem-arroba' }, 'bloqueio', 'E0247'],
  ['tomador_cep', (e) => { tom(e).endereco = { cep: '0645', logradouro: 'Rua A', numero: '1', bairro: 'Centro', municipioIbge: '3505708' } }, 'bloqueio', 'E0240'],
  ['tomador_municipio', (e) => { tom(e).endereco = { cep: '06454000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', municipioIbge: '3599999' } }, 'bloqueio', 'E0238'],
  ['tomador_endereco_parcial', (e) => { tom(e).endereco = { cep: '06454000' } }, 'bloqueio', 'E1235'],
  // Valores / textos / datas
  ['valor_servico', (e) => { srv(e).valorServico = 0 }, 'bloqueio'],
  ['deducoes_negativas', (e) => { srv(e).valorDeducoes = -1 }, 'bloqueio'],
  ['deducoes_maior_valor', (e) => { srv(e).valorDeducoes = 5000 }, 'bloqueio', 'E0427'],
  ['deducoes_nao_suportadas', (e) => { srv(e).valorDeducoes = 10 }, 'bloqueio'],
  ['desconto_incondicionado', (e) => { srv(e).descontoIncondicionado = 1000 }, 'bloqueio', 'E0431'],
  ['desconto_condicionado', (e) => { srv(e).descontoCondicionado = 1500 }, 'bloqueio', 'E0432'],
  ['discriminacao', (e) => { srv(e).discriminacao = 'abc' }, 'bloqueio'],
  ['codigo_servico', (e) => { srv(e).codigoServico = ''; e.config.codigoServicoPadrao = undefined }, 'bloqueio'],
  ['informacoes_complementares', (e) => { srv(e).informacoesComplementares = 'x'.repeat(2001) }, 'bloqueio'],
  ['iss_retido_tipo', (e) => { srv(e).issRetido = 'sim' as never }, 'bloqueio'],
  ['competencia_formato', (e) => { e.nota.dataCompetencia = '10/2026' }, 'bloqueio'],
  ['competencia_futura', (e) => { e.nota.dataCompetencia = '2026-12-01' }, 'bloqueio', 'E0015'],
  ['competencia_antiga', (e) => { e.nota.dataCompetencia = '2025-09-01'; srv(e).ibsCbsCst = ''; srv(e).ibsCbsClassTrib = ''; srv(e).ibsCbsIndOp = '' }, 'aviso', 'E0016'],
]

describe.each(CASOS)('regra %s', (regra, mut, severidade, codigo) => {
  it(`dispara como ${severidade}${codigo ? ` (${codigo})` : ''}`, () => {
    const achado = rodar(mut).find((a) => a.regra === regra)
    expect(achado, JSON.stringify(rodar(mut), null, 1)).toBeDefined()
    expect(achado!.severidade).toBe(severidade)
    if (codigo) expect(achado!.codigoSefin).toBe(codigo)
    expect(achado!.mensagem.length).toBeGreaterThan(15)
  })
  it('não dispara no caso-base', () => {
    expect(rodar().some((a) => a.regra === regra)).toBe(false)
  })
})

describe('detalhes das regras', () => {
  it('município sem convênio é bloqueio em produção e aviso em homologação', () => {
    const semConvenio = (amb: 'producao' | 'homologacao') => rodar((e) => {
      e.prestador.municipioIbge = '3525904'
      e.config.ambienteEmissao = amb
    }).find((a) => a.regra === 'municipio_sem_emissor_nacional')
    expect(semConvenio('producao')?.severidade).toBe('bloqueio')
    expect(semConvenio('homologacao')?.severidade).toBe('aviso')
  })

  it('NBS incompatível lista as NBS da correlação oficial', () => {
    const a = rodar((e) => { srv(e).codigoNbs = '1.0101.11.00' }).find((x) => x.regra === 'nbs_incompativel')!
    expect(a.mensagem).toContain('1.1302.21.00')
    expect(nbsCorrelacionadas('171901')).toEqual(['113022100', '113022200', '113022300'])
    expect(nbsCorrelacionadas('999901')).toBeUndefined()
  })

  it('caso real de produção: 010101 com NBS de construção é barrado', () => {
    const a = rodar((e) => { srv(e).codigoTributacaoNacional = '010101'; srv(e).codigoNbs = '1.0101.11.00' })
    expect(bloqueiosDe(a).map((x) => x.regra)).toContain('nbs_incompativel')
  })

  it('nota herda os padrões da configuração (IBS/CBS e NBS) — config com imóvel bloqueia', () => {
    const a = rodar((e) => {
      Object.assign(srv(e), { ibsCbsCst: '', ibsCbsClassTrib: '', ibsCbsIndOp: '' })
      Object.assign(e.config, { ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '020201' })
    })
    expect(bloqueiosDe(a).map((x) => x.codigoSefin)).toContain('E0932')
  })

  it('MEI sem IBS/CBS e sem retenção passa', () => {
    const a = rodar((e) => {
      e.config.regimeTributario = 'mei'
      Object.assign(srv(e), { ibsCbsCst: '', ibsCbsClassTrib: '', ibsCbsIndOp: '' })
    })
    expect(bloqueiosDe(a)).toEqual([])
  })

  it('config antiga com provedor da prefeitura emite pelo Nacional: as regras do Nacional valem', () => {
    const a = rodar((e) => { e.config.provedorNfse = 'prefeitura'; srv(e).ibsCbsIndOp = '020101'; e.config.credenciais = {} })
    expect(a.some((x) => x.regra === 'cindop_imovel')).toBe(true)
    expect(a.some((x) => x.regra === 'certificado_ausente')).toBe(true)
  })

  it('textoBloqueios junta as mensagens com o código evitado', () => {
    const t = textoBloqueios(rodar((e) => { srv(e).ibsCbsIndOp = '020101' }))
    expect(t).toMatch(/evita E0932/)
    expect(avisosDe(rodar())).toEqual([])
  })
})

describe('preValidarConfigFiscal (padrões do cliente)', () => {
  const config = () => ({ ...base().config })
  it('config correta passa', () => {
    expect(bloqueiosDe(preValidarConfigFiscal({ ...config(), codigoNbs: '1.1302.21.00', ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '100301' }, HOJE))).toEqual([])
  })
  it.each([
    ['cindop_imovel', { codigoNbs: '113022100', ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '020101' }],
    ['ibscbs_incompleto', { ibsCbsCst: '000' }],
    ['ibscbs_sem_nbs', { ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '100301' }],
    ['nbs_incompativel', { codigoNbs: '1.0101.11.00' }],
    ['ctribnac_inexistente', { codigoTributacaoNacional: '171999' }],
    ['aliquota_maxima', { aliquotaPadrao: 8 }],
    ['municipio_sem_emissor_nacional', { municipioIbge: '3525904' }],
  ])('bloqueia %s', (regra, over) => {
    const a = preValidarConfigFiscal({ ...config(), ...over }, HOJE)
    expect(bloqueiosDe(a).map((x) => x.regra)).toContain(regra)
  })
  it('não cobra dados da nota (tomador, valor, certificado)', () => {
    const a = preValidarConfigFiscal({ ...config(), credenciais: {} }, HOJE)
    expect(a.some((x) => x.campo.startsWith('tomador') || x.regra === 'valor_servico' || x.regra === 'certificado_ausente')).toBe(false)
  })
})

describe('utilidades', () => {
  it('CNPJ do titular do e-CNPJ', () => {
    expect(cnpjDoTitularCertificado('EMPRESA X LTDA:11222333000181')).toBe('11222333000181')
    expect(cnpjDoTitularCertificado('Fulano de Tal')).toBeUndefined()
  })
  it('hoje em Brasília vira o dia às 03:00 UTC', () => {
    expect(hojeBrasilia(new Date('2026-11-07T02:59:00Z'))).toBe('2026-11-06')
    expect(hojeBrasilia(new Date('2026-11-07T03:00:00Z'))).toBe('2026-11-07')
  })
  it('formatarNbs', () => {
    expect(formatarNbs('113022100')).toBe('1.1302.21.00')
  })
})
