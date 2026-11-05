// @vitest-environment node
/**
 * NacionalConector com transporte FALSO (nada sai para a rede) e certificado
 * autoassinado gerado na hora (nada é gravado no repositório).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  NacionalConector,
  lerDadosNfseXml,
  type RequisicaoHttp,
  type RespostaHttp,
} from '../../functions/src/nfse/provedores/nacional'
import { compactarXml, descompactarXml } from '../../functions/src/nfse/nacional/ambiente'
import { traduzirErrosSefin } from '../../functions/src/nfse/nacional/erros'
import type { CertificadoA1, ConfigFiscalCliente, EmitirNfseInput, Prestador } from '../../functions/src/nfse/types'

const TEM_OPENSSL = !spawnSync('openssl', ['version']).error
const TEM_XMLLINT = !spawnSync('xmllint', ['--version']).error
const SCHEMAS = path.resolve(__dirname, '../../scripts/poc-nfse-nacional/schemas')
const TMP = mkdtempSync(path.join(tmpdir(), 'nacional-conector-'))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

let cert: CertificadoA1
beforeAll(() => {
  if (!TEM_OPENSSL) return
  const k = path.join(TMP, 'k.pem')
  const c = path.join(TMP, 'c.pem')
  const p = path.join(TMP, 't.pfx')
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=TESTE:11222333000181'])
  spawnSync('openssl', ['pkcs12', '-export', '-inkey', k, '-in', c, '-out', p, '-passout', 'pass:teste'])
  cert = { pfxBase64: readFileSync(p).toString('base64'), senha: 'teste' }
})

const CHAVE = '35057082211222333000181000000000000726110000000001'
const AGORA = () => new Date('2026-11-05T15:00:00Z')

function config(over: Partial<ConfigFiscalCliente> = {}): ConfigFiscalCliente {
  return {
    clienteId: 'c1', municipioEmissor: 'Barueri', municipioIbge: '3505708', inscricaoMunicipal: '12345',
    regimeTributario: 'simples_nacional', optanteSimples: true, incentivadorCultural: false,
    itemListaServico: '17.19', aliquotaPadrao: 2, ambienteEmissao: 'homologacao', provedorNfse: 'nacional', ...over,
  }
}
const prestador: Prestador = { cnpj: '11222333000181', inscricaoMunicipal: '12345', razaoSocial: 'Prestador', municipioIbge: '3505708' }
const input: EmitirNfseInput = {
  clienteId: 'c1',
  tomador: { cpfCnpj: '11444777000161', razaoSocial: 'Tomador Ltda' },
  servico: { discriminacao: 'Serviços contábeis', codigoServico: '1719', valorServico: 1000, issRetido: false },
  numeroRps: '7',
  serieRps: '1',
}

function json(status: number, corpo: unknown): RespostaHttp {
  return { status, corpo: Buffer.from(JSON.stringify(corpo), 'utf8') }
}

const CONVENIO_OK = json(200, { parametrosConvenio: { aderenteAmbienteNacional: 1, aderenteEmissorNacional: 1 }, mensagem: 'ok' })
const NFSE_XML = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${CHAVE}"><nNFSe>123</nNFSe><dhProc>2026-11-05T12:00:00-03:00</dhProc></infNFSe></NFSe>`

/** Transporte falso: responde por rota e guarda o que foi pedido. */
function falso(rotas: (req: RequisicaoHttp) => RespostaHttp | Promise<RespostaHttp>) {
  const pedidos: RequisicaoHttp[] = []
  return {
    pedidos,
    conector: new NacionalConector({
      agora: AGORA,
      transporte: () => async (req) => {
        pedidos.push(req)
        return rotas(req)
      },
    }),
  }
}

describe.skipIf(!TEM_OPENSSL)('NacionalConector.emitir', () => {
  it('homologação: confere convênio no ADN restrito, envia DPS tpAmb 2 compactada e lê a NFS-e', async () => {
    const { conector, pedidos } = falso((req) =>
      req.url.pathname.endsWith('/convenio')
        ? CONVENIO_OK
        : json(201, { chaveAcesso: CHAVE, nfseXmlGZipB64: compactarXml(NFSE_XML), idDps: 'x' }),
    )
    const r = await conector.emitir(input, config(), cert, prestador)
    expect(r).toMatchObject({ sucesso: true, numeroNfse: '123', codigoVerificacao: CHAVE, chaveAcesso: CHAVE })
    expect(r.idDps).toBe('DPS' + '3505708' + '2' + '11222333000181' + '00001' + '000000000000007')
    expect(pedidos.map((p) => `${p.metodo} ${p.url.href}`)).toEqual([
      'GET https://adn.producaorestrita.nfse.gov.br/parametrizacao/3505708/convenio',
      'POST https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse',
    ])
    const dps = descompactarXml((pedidos[1].corpoJson as { dpsXmlGZipB64: string }).dpsXmlGZipB64)
    expect(dps).toContain('<tpAmb>2</tpAmb>')
    expect(dps).toContain('<nDPS>7</nDPS>')
    expect(dps).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/)
    expect(dps.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    if (TEM_XMLLINT) {
      const arq = path.join(TMP, 'dps-conector.xml')
      writeFileSync(arq, dps)
      const v = spawnSync('xmllint', ['--noout', '--nonet', '--schema', path.join(SCHEMAS, 'DPS_v1.01.xsd'), arq], { encoding: 'utf8' })
      expect(`${v.stdout}${v.stderr}`).toContain('validates')
    }
  })

  it('produção: só hosts de produção e tpAmb 1', async () => {
    const { conector, pedidos } = falso((req) =>
      req.url.pathname.endsWith('/convenio') ? CONVENIO_OK : json(201, { chaveAcesso: CHAVE, nfseXmlGZipB64: compactarXml(NFSE_XML) }),
    )
    const r = await conector.emitir(input, config({ ambienteEmissao: 'producao' }), cert, prestador)
    expect(r.sucesso).toBe(true)
    expect(pedidos.map((p) => p.url.hostname)).toEqual(['adn.nfse.gov.br', 'sefin.nfse.gov.br'])
    expect(pedidos[1].url.pathname).toBe('/SefinNacional/nfse')
    const dps = descompactarXml((pedidos[1].corpoJson as { dpsXmlGZipB64: string }).dpsXmlGZipB64)
    expect(dps).toContain('<tpAmb>1</tpAmb>')
    expect(dps).not.toContain('<tpAmb>2</tpAmb>')
  })

  it('município sem convênio (404 do ADN) falha em pt-BR sem enviar a DPS', async () => {
    const { conector, pedidos } = falso(() => json(404, { parametrosConvenio: null, mensagem: 'O convênio do o município <Cajamar/SP> ainda não está ativo' }))
    const r = await conector.emitir(input, config({ municipioIbge: '3509205', municipioEmissor: 'Cajamar' }), cert, { ...prestador, municipioIbge: '3509205' })
    expect(r).toMatchObject({
      sucesso: false,
      codigoErro: 'MUNICIPIO_SEM_CONVENIO',
      erro: 'Cajamar ainda não aderiu ao Emissor Nacional — não é possível emitir pelo Ambiente Nacional para este município.',
    })
    expect(pedidos).toHaveLength(1)
  })

  it('convênio só de compartilhamento (aderenteEmissorNacional 0) também é recusado', async () => {
    const { conector, pedidos } = falso(() => json(200, { parametrosConvenio: { aderenteAmbienteNacional: 1, aderenteEmissorNacional: 0 } }))
    const r = await conector.emitir(input, config({ municipioIbge: '3525904' }), cert, { ...prestador, municipioIbge: '3525904' })
    expect(r).toMatchObject({ sucesso: false, codigoErro: 'MUNICIPIO_SEM_EMISSOR_NACIONAL' })
    expect(r.erro).toMatch(/^Jundiaí tem convênio/)
    expect(pedidos).toHaveLength(1)
  })

  it('E0037 da Sefin vira a mensagem de convênio, com o código original', async () => {
    const { conector } = falso((req) =>
      req.url.pathname.endsWith('/convenio')
        ? json(500, {})
        : json(400, { erros: [{ Codigo: 'E0037', Descricao: 'O código do município emissor informado na DPS é inexistente no cadastro de convênio municipal do sistema nacional.' }] }),
    )
    const r = await conector.emitir(input, config({ municipioIbge: '3509205' }), cert, { ...prestador, municipioIbge: '3509205' })
    expect(r.sucesso).toBe(false)
    expect(r.codigoErro).toBe('E0037')
    expect(r.erro).toContain('Cajamar ainda não aderiu ao Emissor Nacional')
    expect(r.detalhes).toContain('[E0037]')
  })

  it('sem resposta da Sefin: falha recuperável, com o Id da DPS para a consulta do retry', async () => {
    const { conector } = falso((req) => {
      if (req.url.pathname.endsWith('/convenio')) return CONVENIO_OK
      throw new Error('ECONNRESET')
    })
    const r = await conector.emitir(input, config(), cert, prestador)
    expect(r).toMatchObject({ sucesso: false, codigoErro: 'SEFIN_SEM_RESPOSTA' })
    expect(r.idDps).toMatch(/^DPS3505708/)
  })

  it('sem certificado, ambiente inválido ou sem número alocado: falha antes da rede', async () => {
    const { conector, pedidos } = falso(() => CONVENIO_OK)
    expect((await conector.emitir(input, config(), undefined, prestador)).codigoErro).toBe('CERTIFICADO_AUSENTE')
    expect((await conector.emitir(input, config({ ambienteEmissao: 'teste' as 'producao' }), cert, prestador)).codigoErro).toBe('AMBIENTE_INVALIDO')
    expect((await conector.emitir({ ...input, serieRps: 'RPS' }, config(), cert, prestador)).codigoErro).toBe('DPS_SEM_NUMERO')
    expect((await conector.emitir(input, config(), { ...cert, senha: 'errada' }, prestador)).codigoErro).toBe('CERTIFICADO_INVALIDO')
    expect((await conector.emitir(input, config({ itemListaServico: 'xx' }), cert, prestador)).codigoErro).toBe('CTRIBNAC_INVALIDO')
    expect(pedidos).toHaveLength(0)
  })
})

describe.skipIf(!TEM_OPENSSL)('NacionalConector.consultar', () => {
  it('pela chave: GET /nfse/{chave}', async () => {
    const { conector, pedidos } = falso(() => json(200, { nfseXmlGZipB64: compactarXml(NFSE_XML) }))
    const r = await conector.consultar({ nfseId: 'n', clienteId: 'c1', codigoVerificacao: CHAVE }, config(), cert, prestador)
    expect(r).toMatchObject({ sucesso: true, status: 'emitida', numeroNfse: '123' })
    expect(pedidos[0].url.pathname).toBe(`/API/SefinNacional/nfse/${CHAVE}`)
  })

  it('pré-retry pela DPS: 404 = nenhuma nota (retry segue); 200 = nota já existe', async () => {
    const vazio = falso(() => json(404, {}))
    const r404 = await vazio.conector.consultar({ nfseId: 'n', clienteId: 'c1', numeroRps: '7', serieRps: '1' }, config(), cert, prestador)
    expect(r404.sucesso).toBe(true)
    expect(r404.status).toBeUndefined()
    expect(vazio.pedidos[0].url.pathname).toBe('/API/SefinNacional/dps/DPS' + '3505708' + '2' + '11222333000181' + '00001' + '000000000000007')

    const achou = falso((req) =>
      req.url.pathname.includes('/dps/') ? json(200, { chaveAcesso: CHAVE }) : json(200, { nfseXmlGZipB64: compactarXml(NFSE_XML) }),
    )
    const r200 = await achou.conector.consultar({ nfseId: 'n', clienteId: 'c1', numeroRps: '7', serieRps: '1' }, config(), cert, prestador)
    expect(r200).toMatchObject({ sucesso: true, status: 'emitida', chaveAcesso: CHAVE, numeroNfse: '123' })
  })

  it('RPS municipal antigo não é consultado no nacional', async () => {
    const { conector, pedidos } = falso(() => json(500, {}))
    const r = await conector.consultar({ nfseId: 'n', clienteId: 'c1', numeroRps: '12345678', serieRps: 'RPS' }, config(), cert, prestador)
    expect(r.sucesso).toBe(true)
    expect(r.status).toBeUndefined()
    expect(pedidos).toHaveLength(0)
  })
})

describe.skipIf(!TEM_OPENSSL)('NacionalConector.cancelar', () => {
  it('assina e envia o evento e101101 com tpAmb do ambiente', async () => {
    const { conector, pedidos } = falso(() => json(201, { eventoXmlGZipB64: compactarXml('<evento/>') }))
    const r = await conector.cancelar(
      { nfseId: 'n', clienteId: 'c1', codigoVerificacao: CHAVE, motivo: 'Valor informado errado na nota' },
      config({ ambienteEmissao: 'producao' }), cert, prestador,
    )
    expect(r).toMatchObject({ sucesso: true, status: 'cancelada' })
    expect(pedidos[0].url.href).toBe(`https://sefin.nfse.gov.br/SefinNacional/nfse/${CHAVE}/eventos`)
    const ev = descompactarXml((pedidos[0].corpoJson as { pedidoRegistroEventoXmlGZipB64: string }).pedidoRegistroEventoXmlGZipB64)
    expect(ev).toContain('<tpAmb>1</tpAmb>')
    expect(ev).toContain('<CNPJAutor>11222333000181</CNPJAutor>')
    expect(ev).toContain('<xMotivo>Valor informado errado na nota</xMotivo>')
    expect(ev).toMatch(/<\/infPedReg><Signature/)
  })

  it('motivo curto e nota sem chave falham sem rede', async () => {
    const { conector, pedidos } = falso(() => json(500, {}))
    expect((await conector.cancelar({ nfseId: 'n', clienteId: 'c1', codigoVerificacao: CHAVE, motivo: 'curto demais' }, config(), cert, prestador)).codigoErro).toBe('MOTIVO_INVALIDO')
    expect((await conector.cancelar({ nfseId: 'n', clienteId: 'c1', codigoVerificacao: 'ABC123', motivo: 'Motivo comprido o bastante' }, config(), cert, prestador)).codigoErro).toBe('CHAVE_AUSENTE')
    expect(pedidos).toHaveLength(0)
  })
})

describe('tradução de erros e leitura da NFS-e', () => {
  it('códigos conhecidos em pt-BR, desconhecidos com a descrição da Sefin', () => {
    const t = traduzirErrosSefin(
      [{ codigo: 'E0718', descricao: 'x' }, { codigo: 'E1203', descricao: 'vencido' }, { codigo: 'E9999', descricao: 'Algo novo' }],
      { municipio: 'Barueri' },
    )
    expect(t.codigoErro).toBe('E0718')
    expect(t.erro).toContain('não é do prestador')
    expect(t.erro).toContain('Certificado A1 recusado')
    expect(t.erro).toContain('Algo novo (código E9999)')
    expect(t.detalhes).toContain('[E9999] Algo novo')
    expect(traduzirErrosSefin([], { municipio: 'X' }).codigoErro).toBe('SEFIN_REJEITADA')
  })

  it('lê nNFSe e a chave do Id do infNFSe', () => {
    expect(lerDadosNfseXml(NFSE_XML)).toMatchObject({ numeroNfse: '123', chaveAcesso: CHAVE })
  })
})
