// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { createHash, createVerify, X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  dataBrasilia,
  formatarDhEmi,
  instanteSeguroParaEmissao,
  montarDpsXml,
  montarIdDps,
  montarIdPedidoEvento,
  montarPedidoCancelamentoXml,
  validarDadosNota,
  type DadosNota,
} from '../../scripts/poc-nfse-nacional/lib/dps'
import { assinarXml, extrairChaveDoPfx } from '../../functions/src/nfse/xml/signer'

const SCHEMAS = path.resolve(__dirname, '../../scripts/poc-nfse-nacional/schemas')
const TEM_XMLLINT = !spawnSync('xmllint', ['--version']).error
const TEM_OPENSSL = !spawnSync('openssl', ['version']).error
const TMP = mkdtempSync(path.join(tmpdir(), 'poc-nfse-'))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

/** Valida no XSD oficial da produção restrita (xmllint, sem rede). */
function validarXsd(xml: string, xsd: string): { ok: boolean; saida: string } {
  const arq = path.join(TMP, `x-${Math.random().toString(36).slice(2)}.xml`)
  writeFileSync(arq, xml)
  const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', path.join(SCHEMAS, xsd), arq], { encoding: 'utf8' })
  return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` }
}

const DH = '2026-11-05T10:00:00-03:00'

function nota(over: Partial<DadosNota> = {}): DadosNota {
  return {
    prestador: {
      cnpj: '11.222.333/0001-81',
      inscricaoMunicipal: '123456',
      municipioIbge: '3525904',
      regime: { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 },
    },
    tomador: { cpfCnpj: '11444777000161', razaoSocial: 'Padaria & Cia <Teste>' },
    servico: { cTribNac: '171901', descricao: 'Contabilidade mensal', municipioPrestacao: '3525904' },
    valores: { valorServico: 1500, tribISSQN: 1, tpRetISSQN: 1, totTrib: { pTotTribSN: 6 } },
    dps: { serie: '900', numero: 42, competencia: '2026-11-05' },
    ...over,
  }
}

describe('Id da DPS', () => {
  it('compõe DPS + IBGE + tpInsc + inscrição(14) + série(5) + número(15) = 45 posições', () => {
    const id = montarIdDps({ municipioIbge: '3525904', cpfCnpj: '11222333000181', serie: '900', numero: 42 })
    expect(id).toBe('DPS3525904' + '2' + '11222333000181' + '00900' + '000000000000042')
    expect(id).toHaveLength(45)
  })

  it('CPF vai com tpInsc 1 e zeros à esquerda', () => {
    const id = montarIdDps({ municipioIbge: '3525904', cpfCnpj: '12345678909', serie: 1, numero: 1 })
    expect(id.slice(3, 25)).toBe('3525904' + '1' + '00012345678909')
  })

  it('recusa número com zero à esquerda e IBGE incompleto', () => {
    expect(() => montarIdDps({ municipioIbge: '352590', cpfCnpj: '11222333000181', serie: 1, numero: 1 })).toThrow()
    expect(() => montarIdDps({ municipioIbge: '3525904', cpfCnpj: '11222333000181', serie: 1, numero: '01' })).toThrow()
  })
})

describe('montarDpsXml', () => {
  it('trava tpAmb = 2 e produz cabeçalho no leiaute 1.01 sem prefixo de namespace', () => {
    const { xml, id } = montarDpsXml(nota(), { dhEmi: DH })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">')).toBe(true)
    expect(xml).toContain(`<infDPS Id="${id}"><tpAmb>2</tpAmb><dhEmi>${DH}</dhEmi>`)
    expect(xml).not.toMatch(/<tpAmb>1<\/tpAmb>/)
    expect(xml).not.toMatch(/<\w+:/) // E1228: prefixo proibido
    expect(xml).toContain('<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>3525904</cLocEmi>')
  })

  it('prestador emitente vai sem nome/endereço; tomador escapado; xDescServ por último', () => {
    const { xml } = montarDpsXml(nota(), { dhEmi: DH })
    expect(xml).toContain('<prest><CNPJ>11222333000181</CNPJ><IM>123456</IM><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>')
    expect(xml).toContain('<xNome>Padaria &amp; Cia &lt;Teste&gt;</xNome>')
    expect(xml).toMatch(/<cServ><cTribNac>171901<\/cTribNac><xDescServ>/)
    expect(xml).toContain('<vServ>1500.00</vServ>')
    expect(xml).toContain('<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>')
    expect(xml).not.toContain('IBSCBS')
  })

  it('não emite regApTribSN para quem não é ME/EPP', () => {
    const d = nota()
    d.prestador.regime = { opSimpNac: 1, regEspTrib: 0 }
    d.valores.totTrib = { indTotTrib: 0 }
    const { xml } = montarDpsXml(d, { dhEmi: DH })
    expect(xml).not.toContain('regApTribSN')
    expect(xml).toContain('<indTotTrib>0</indTotTrib>')
  })

  it('validação prévia aponta os erros conhecidos da Sefin', () => {
    const d = nota()
    d.prestador.regime = { opSimpNac: 2, regApTribSN: 1, regEspTrib: 0 }
    d.servico.cTribNac = '17.19.01'
    d.valores.pisCofins = { cst: '01' }
    const erros = validarDadosNota(d).join('\n')
    expect(erros).toMatch(/E0162/)
    expect(erros).toMatch(/cTribNac/)
    expect(erros).toMatch(/E0676/)
    expect(() => montarDpsXml(d, { dhEmi: DH })).toThrow(/Dados da nota inválidos/)
  })

  it('recusa competência posterior à emissão', () => {
    expect(() => montarDpsXml(nota({ dps: { serie: '1', numero: 1, competencia: '2026-12-01' } }), { dhEmi: DH })).toThrow(/competencia/)
  })

  it.skipIf(!TEM_XMLLINT)('DPS mínima passa no XSD oficial (DPS_v1.01, produção restrita)', () => {
    const { xml } = montarDpsXml(nota({ tomador: undefined }), { dhEmi: DH })
    const r = validarXsd(xml, 'DPS_v1.01.xsd')
    expect(r.saida).toContain('validates')
    expect(r.ok).toBe(true)
  })

  it.skipIf(!TEM_XMLLINT)('DPS completa (endereço, PIS/COFINS, retenções, descontos, IBS/CBS) passa no XSD', () => {
    const d = nota({
      tomador: {
        cpfCnpj: '11444777000161',
        razaoSocial: 'Tomador Teste',
        inscricaoMunicipal: '999',
        email: 'a@b.com',
        fone: '(11) 4444-5555',
        endereco: { cep: '13201-000', municipioIbge: '3525904', logradouro: 'Rua A', numero: '1', complemento: 'sala 2', bairro: 'Centro' },
      },
      servico: {
        cTribNac: '171901',
        cTribMun: '001',
        cNBS: '113011000',
        descricao: 'Serviço com\nquebra de linha',
        municipioPrestacao: '3525904',
        informacoesComplementares: 'Teste',
      },
      ibscbs: { indFinal: 0, cIndOp: '100301', indDest: 0, cst: '000', cClassTrib: '000001' },
    })
    d.prestador.regime = { opSimpNac: 1, regEspTrib: 0 }
    d.valores = {
      valorServico: 2000,
      descontoIncondicionado: 10,
      tribISSQN: 1,
      tpRetISSQN: 2,
      aliquotaIss: 2.5,
      pisCofins: { cst: '01', baseCalculo: 2000, aliquotaPis: 0.65, aliquotaCofins: 3, valorPis: 13, valorCofins: 60, tpRetPisCofins: '2' },
      retencaoIrrf: 30,
      retencaoCsll: 20,
      totTrib: { pTotTrib: { federal: 10, estadual: 0, municipal: 2.5 } },
    }
    const { xml } = montarDpsXml(d, { dhEmi: DH })
    expect(xml).toContain('<IBSCBS><indFinal>0</indFinal><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib></valores></IBSCBS></infDPS>')
    const r = validarXsd(xml, 'DPS_v1.01.xsd')
    expect(r.saida).toContain('validates')
  })
})

describe('pedido de cancelamento (e101101)', () => {
  const chave = '35259042211222333000181000000000000126110000000001'

  it('Id = PRE + chave(50) + 101101 (59 posições), tpAmb 2, xDesc acentuado', () => {
    const { xml, id } = montarPedidoCancelamentoXml(
      { chaveAcesso: chave, autorCpfCnpj: '11222333000181', codigoMotivo: 1, motivo: 'Erro no valor do serviço' },
      { dhEvento: DH },
    )
    expect(id).toBe(`PRE${chave}101101`)
    expect(id).toHaveLength(59)
    expect(xml).toContain('<tpAmb>2</tpAmb>')
    expect(xml).toContain('<CNPJAutor>11222333000181</CNPJAutor>')
    expect(xml).toContain('<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo>')
  })

  it('recusa motivo curto e chave malformada', () => {
    expect(() =>
      montarPedidoCancelamentoXml({ chaveAcesso: chave, autorCpfCnpj: '11222333000181', codigoMotivo: 1, motivo: 'curto' }, { dhEvento: DH }),
    ).toThrow(/15 a 255/)
    expect(() => montarIdPedidoEvento('123', '101101')).toThrow(/Chave/)
  })

  it.skipIf(!TEM_XMLLINT)('passa no XSD pedRegEvento_v1.01', () => {
    const { xml } = montarPedidoCancelamentoXml(
      { chaveAcesso: chave, autorCpfCnpj: '11222333000181', codigoMotivo: 9, motivo: 'Teste de cancelamento PoC' },
      { dhEvento: DH },
    )
    expect(validarXsd(xml, 'pedRegEvento_v1.01.xsd').saida).toContain('validates')
  })
})

describe('datas no fuso de Brasília', () => {
  it('formata com -03:00 e sem milissegundos', () => {
    expect(formatarDhEmi(new Date('2026-11-05T13:04:05.987Z'))).toBe('2026-11-05T10:04:05-03:00')
    expect(dataBrasilia(new Date('2026-11-06T02:00:00Z'))).toBe('2026-11-05')
  })

  it('recua alguns segundos, mas não cruza a meia-noite (trocaria a competência)', () => {
    expect(instanteSeguroParaEmissao(new Date('2026-11-05T15:00:00Z')).toISOString()).toBe('2026-11-05T14:59:50.000Z')
    const pertoDaMeiaNoite = new Date('2026-11-05T03:00:03Z') // 00:00:03 em Brasília
    expect(instanteSeguroParaEmissao(pertoDaMeiaNoite)).toBe(pertoDaMeiaNoite)
  })
})

/**
 * Assinatura com um certificado AUTOASSINADO gerado na hora (nada é gravado no
 * repositório). Confere a assinatura de forma independente do xml-crypto:
 * recalcula o DigestValue do infDPS canonicalizado e verifica o SignatureValue.
 */
describe.skipIf(!TEM_OPENSSL)('assinatura XMLDSig da DPS', () => {
  function pfxDeTeste(): { pfxBase64: string; senha: string } {
    const senha = 'senha-de-teste'
    const k = path.join(TMP, 'k.pem')
    const c = path.join(TMP, 'c.pem')
    const p = path.join(TMP, 't.pfx')
    const a = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=TESTE:11222333000181'])
    expect(a.status).toBe(0)
    const b = spawnSync('openssl', ['pkcs12', '-export', '-inkey', k, '-in', c, '-out', p, '-passout', `pass:${senha}`])
    expect(b.status).toBe(0)
    return { pfxBase64: readFileSync(p).toString('base64'), senha }
  }

  /** C14N inclusiva do trecho: namespace herdado no topo, vazios expandidos. */
  function c14n(fragmento: string, tag: string, ns: string): string {
    return fragmento
      .replace(new RegExp(`^<${tag}`), `<${tag} xmlns="${ns}"`)
      .replace(/<(\w+)([^<>]*?)\/>/g, '<$1$2></$1>')
  }

  it('Signature é a última filha de <DPS> (depois de infDPS), sem prefixo, e confere', () => {
    const { pfxBase64, senha } = pfxDeTeste()
    const chave = extrairChaveDoPfx(pfxBase64, senha)
    const { xml, id } = montarDpsXml(nota(), { dhEmi: DH })
    const assinado = assinarXml(xml, id, chave, { posicao: 'after' })

    expect(assinado).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">[\s\S]*<\/Signature><\/DPS>$/)
    expect(assinado).toContain(`<Reference URI="#${id}">`)
    expect(assinado).not.toMatch(/<ds:/)

    const infDps = assinado.match(/<infDPS[\s\S]*<\/infDPS>/)![0]
    const digest = createHash('sha1').update(c14n(infDps, 'infDPS', 'http://www.sped.fazenda.gov.br/nfse')).digest('base64')
    expect(assinado).toContain(`<DigestValue>${digest}</DigestValue>`)

    const signedInfo = assinado.match(/<SignedInfo>[\s\S]*<\/SignedInfo>/)![0]
    const valor = assinado.match(/<SignatureValue>([^<]+)<\/SignatureValue>/)![1]
    const certB64 = assinado.match(/<X509Certificate>([^<]+)<\/X509Certificate>/)![1]
    const cert = new X509Certificate(Buffer.from(certB64, 'base64'))
    const ok = createVerify('RSA-SHA1')
      .update(c14n(signedInfo, 'SignedInfo', 'http://www.w3.org/2000/09/xmldsig#'))
      .verify(cert.publicKey, valor, 'base64')
    expect(ok).toBe(true)

    if (TEM_XMLLINT) {
      expect(validarXsd(`<?xml version="1.0" encoding="UTF-8"?>${assinado.replace(/^<\?xml[^>]*\?>/, '')}`, 'DPS_v1.01.xsd').saida).toContain('validates')
    }
  })

  it('padrão continua ABRASF: sem opção, a Signature entra dentro do elemento', () => {
    const { pfxBase64, senha } = pfxDeTeste()
    const chave = extrairChaveDoPfx(pfxBase64, senha)
    const { xml, id } = montarDpsXml(nota(), { dhEmi: DH })
    expect(assinarXml(xml, id, chave)).toMatch(/<Signature[\s\S]*<\/Signature><\/infDPS><\/DPS>$/)
  })
})
