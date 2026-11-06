// @vitest-environment node
/**
 * Orquestração da emissão de NFS-e pelo Ambiente Nacional, ponta a ponta no
 * servidor: processarEmissao, emitirNfse, retryNfse, consultarNfse,
 * emitirNfseLote e a rotina de reconciliação — com Firestore/Storage EM
 * MEMÓRIA e o transporte HTTP do NacionalConector injetado (nada sai para a
 * rede). Certificado autoassinado gerado na hora (openssl).
 *
 * Prova os achados de 2026-11-06: C1 (duplicidade), A2 (nota fantasma),
 * A3 (consulta não regride cancelada), A4 (chave global), M3, M8.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FieldValueFalso, FirestoreFalso, TimestampFalso } from '../helpers/firestore-falso'

const ctx = vi.hoisted(() => {
  process.env.CREDENTIAL_KEY = 'a'.repeat(64)
  return { db: null as unknown as InstanceType<typeof import('../helpers/firestore-falso').FirestoreFalso>, storage: new Map<string, Buffer>() }
})

vi.mock('../../functions/node_modules/firebase-admin', async () => {
  const f = await import('../helpers/firestore-falso')
  // audit.ts usa `admin.firestore.Timestamp` (instanceof) além de admin.firestore().
  const firestore = Object.assign(() => ctx.db, { Timestamp: f.TimestampFalso, FieldValue: f.FieldValueFalso })
  return { firestore, apps: [], initializeApp: () => undefined }
})
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/firestore/index.js', async () => {
  const f = await import('../helpers/firestore-falso')
  return { FieldValue: f.FieldValueFalso, Timestamp: f.TimestampFalso, getFirestore: () => ctx.db }
})
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/storage/index.js', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (p: string) => ({
        exists: async () => [ctx.storage.has(p)],
        download: async () => [ctx.storage.get(p)],
        save: async (b: Buffer) => { ctx.storage.set(p, b) },
      }),
    }),
  }),
}))
vi.mock('../../functions/src/nfse/danfse/servico', () => ({ gerarESalvarDanfse: vi.fn(async () => undefined) }))

import { processarEmissao } from '../../functions/src/nfse/emitir'
import * as emitirModulo from '../../functions/src/nfse/emitir'
import { consultarNfse, retryNfse } from '../../functions/src/nfse/ciclo'
import { emitirNfseLote } from '../../functions/src/nfse/emitir-lote'
import { executarReconciliacaoNfse } from '../../functions/src/scheduler/nfse-reconciliacao'
import { isProducaoLiberadaPorConfigOuConector } from '../../functions/src/nfse/conectores'
import { definirOpcoesConectorNacional } from '../../functions/src/nfse/roteador'
import { encrypt } from '../../functions/src/nfse/encrypt'
import { compactarXml, descompactarXml } from '../../functions/src/nfse/nacional/ambiente'
import type { RequisicaoHttp, RespostaHttp } from '../../functions/src/nfse/provedores/nacional'
import type { ConfigFiscalCliente, EmitirNfseInput } from '../../functions/src/nfse/types'

const TEM_OPENSSL = !spawnSync('openssl', ['version']).error
const TMP = mkdtempSync(path.join(tmpdir(), 'nfse-orquestracao-'))
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
  definirOpcoesConectorNacional(undefined)
})

let pfxBase64 = ''
beforeAll(() => {
  if (!TEM_OPENSSL) return
  const k = path.join(TMP, 'k.pem')
  const c = path.join(TMP, 'c.pem')
  const p = path.join(TMP, 't.pfx')
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=TESTE:11222333000181'])
  spawnSync('openssl', ['pkcs12', '-export', '-inkey', k, '-in', c, '-out', p, '-passout', 'pass:teste'])
  pfxBase64 = readFileSync(p).toString('base64')
})

// ─── Sefin falsa ────────────────────────────────────────────────────────────

const CHAVE = '35057082211222333000181000000000000726110000000001'
/** Chave distinta por nota (a 1ª é CHAVE). */
const chaveN = (n: number) => (n === 1 ? CHAVE : CHAVE.slice(0, 45) + String(n).padStart(5, '0'))
const nfseXml = (chave: string, numero: string) => `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${chave}"><nNFSe>${numero}</nNFSe><dhProc>2026-11-05T12:00:00-03:00</dhProc></infNFSe></NFSe>`
/** idDps do prestador de teste (Barueri, CNPJ, série 1). */
const idDps = (numero: number) => `DPS35057082${'11222333000181'}00001${String(numero).padStart(15, '0')}`

function json(status: number, corpo: unknown): RespostaHttp {
  return { status, corpo: Buffer.from(JSON.stringify(corpo), 'utf8') }
}

type Rota = (req: RequisicaoHttp) => RespostaHttp | Promise<RespostaHttp>

/** Estado da Sefin falsa: quais DPS já geraram nota, eventos, e o que fazer no POST. */
const sefin = {
  pedidos: [] as RequisicaoHttp[],
  notas: new Map<string, string>(), // idDps → chave
  cancelada: false,
  aoEmitir: null as Rota | null,
}

function idDpsDoCorpo(req: RequisicaoHttp): string {
  const xml = descompactarXml((req.corpoJson as { dpsXmlGZipB64: string }).dpsXmlGZipB64)
  return xml.match(/<infDPS[^>]*Id="(DPS[0-9]+)"/)![1]
}

const rotaPadrao: Rota = async (req) => {
  const p = req.url.pathname
  if (p.endsWith('/convenio')) return json(200, { parametrosConvenio: { aderenteAmbienteNacional: 1, aderenteEmissorNacional: 1 } })
  if (req.metodo === 'POST' && p.endsWith('/SefinNacional/nfse')) {
    if (sefin.aoEmitir) return sefin.aoEmitir(req)
    return emitirNaSefin(req)
  }
  const dps = p.match(/\/dps\/((?:DPS)?[0-9]{42})$/)
  if (dps) {
    const chave = sefin.notas.get(dps[1].startsWith("DPS") ? dps[1] : `DPS${dps[1]}`)
    return chave ? json(200, { chaveAcesso: chave, idDps: dps[1] }) : json(404, { erros: [{ Codigo: 'E404', Descricao: 'não encontrada' }] })
  }
  const eventos = p.match(/\/nfse\/([0-9A-Z]{50})\/eventos$/)
  if (eventos) {
    return sefin.cancelada
      ? json(200, { eventos: [{ tipoEvento: 'e101101', eventoXmlGZipB64: compactarXml('<evento><infEvento><e101101><xDesc>Cancelamento de NFS-e</xDesc></e101101></infEvento></evento>') }] })
      : json(404, { erros: [{ Codigo: 'E404', Descricao: 'sem eventos' }] })
  }
  const nfse = p.match(/\/nfse\/([0-9A-Z]{50})$/)
  if (nfse) {
    const n = [...sefin.notas.values()].indexOf(nfse[1]) + 1 || 1
    return json(200, { chaveAcesso: nfse[1], nfseXmlGZipB64: compactarXml(nfseXml(nfse[1], String(122 + n))) })
  }
  return json(500, { erro: 'rota não simulada ' + p })
}

/** A Sefin aceita a DPS: registra a nota (para as consultas seguintes) e devolve o XML. */
function emitirNaSefin(req: RequisicaoHttp): RespostaHttp {
  const id = idDpsDoCorpo(req)
  if (sefin.notas.has(id)) {
    return json(400, { erros: [{ Codigo: 'E0014', Descricao: 'Conjunto de Série, Número, Código do Município Emissor e CNPJ/CPF informado nesta DPS já existe em uma NFS-e gerada a partir de uma DPS enviada anteriormente.' }] })
  }
  const n = sefin.notas.size + 1
  const chave = chaveN(n)
  sefin.notas.set(id, chave)
  return json(201, { chaveAcesso: chave, idDps: id, nfseXmlGZipB64: compactarXml(nfseXml(chave, String(122 + n))) })
}

const posts = () => sefin.pedidos.filter((r) => r.metodo === 'POST')

// ─── Dados de base ──────────────────────────────────────────────────────────

const TENANT = 'ttrd'
const UID = 'u1'

function configFiscal(over: Partial<ConfigFiscalCliente> = {}) {
  return {
    clienteId: 'c1', tenantId: TENANT, municipioEmissor: 'Barueri', municipioIbge: '3505708', inscricaoMunicipal: '12345',
    regimeTributario: 'simples_nacional', optanteSimples: true, incentivadorCultural: false,
    itemListaServico: '17.19', aliquotaPadrao: 2, ambienteEmissao: 'homologacao', provedorNfse: 'nacional',
    credenciais: { certificadoStoragePath: 'certificados/c1.pfx.b64', certificadoSenha: encrypt('teste') },
    ...over,
  }
}

const dadosRascunho = {
  tomadorNome: 'Tomador do Servidor Ltda',
  tomadorCpfCnpj: '11444777000161',
  tomadorEmail: null,
  tomadorEndereco: null,
  descricaoServico: 'Serviços contábeis de outubro',
  codigoServico: '1719',
  itemListaServico: '17.19',
  codigoNbs: '113022100',
  valorServico: 1000,
  aliquota: 2,
  issRetido: false,
}

function semear(over: { config?: Partial<ConfigFiscalCliente> } = {}) {
  const db = ctx.db
  db.gravar(db.collection('usuarios').doc(UID), { perfil: 'fiscal', ativo: true, tenantId: TENANT, nome: 'Fiscal' })
  db.gravar(db.collection('clientes').doc('c1'), { tenantId: TENANT, cpfCnpj: '11.222.333/0001-81', razaoSocial: 'Prestador Teste Ltda' })
  db.gravar(db.collection('clientes').doc('c2'), { tenantId: TENANT, cpfCnpj: '11444777000161', razaoSocial: 'Outro Cliente' })
  db.gravar(db.collection('clientes_fiscal').doc('f1'), configFiscal(over.config) as Record<string, unknown>)
  ctx.storage.set('certificados/c1.pfx.b64', Buffer.from(pfxBase64, 'utf8'))
}

function criarRascunho(id: string, over: Record<string, unknown> = {}) {
  ctx.db.gravar(ctx.db.collection('nfse_rascunhos').doc(id), {
    tenantId: TENANT, clienteId: 'c1', clienteNome: 'Prestador Teste Ltda', status: 'aguardando_emissao',
    dados: { ...dadosRascunho }, criadoEm: TimestampFalso.now(), atualizadoEm: TimestampFalso.now(), ...over,
  })
}

function inputDoFormulario(over: Partial<EmitirNfseInput> = {}): EmitirNfseInput {
  return {
    clienteId: 'c1',
    tomador: { razaoSocial: 'Tomador do Formulário Ltda', cpfCnpj: '11444777000161' },
    servico: { discriminacao: 'Serviços contábeis de outubro', codigoServico: '1719', itemListaServico: '17.19', valorServico: 1000, issRetido: false, codigoNbs: '113022100' },
    ...over,
  }
}

const notas = () => ctx.db.colecaoInteira('nfse_emitidas')
const rascunho = (id: string) => ctx.db.dados(`nfse_rascunhos/${id}`) as Record<string, unknown>
/** Chama o handler do callable como o SDK faria (usuário UID autenticado). Resultado sem tipo: os testes conferem a forma. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chamar = (fn: { run: (req: never) => unknown }, data: unknown): Promise<any> =>
  Promise.resolve(fn.run({ auth: { uid: UID }, data } as never))

beforeEach(() => {
  ctx.db = new FirestoreFalso()
  ctx.storage.clear()
  sefin.pedidos = []
  sefin.notas = new Map()
  sefin.cancelada = false
  sefin.aoEmitir = null
  definirOpcoesConectorNacional({
    agora: () => new Date('2026-11-05T15:00:00Z'),
    transporte: () => async (req) => {
      sefin.pedidos.push(req)
      return rotaPadrao(req)
    },
  })
  semear()
})

// ─── C1: duplicidade ────────────────────────────────────────────────────────

describe.skipIf(!TEM_OPENSSL)('C1 — mesmo rascunho nunca vira duas notas', () => {
  it('dois envios simultâneos do mesmo rascunho → uma nota, um POST; o segundo é recusado', async () => {
    criarRascunho('r1')
    sefin.aoEmitir = async (req) => {
      await new Promise((r) => setTimeout(r, 30))
      return emitirNaSefin(req)
    }
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    const input = normalizarRascunho('r1', rascunho('r1'))
    const [a, b] = await Promise.allSettled([processarEmissao(input, UID), processarEmissao(input, UID)])

    const ok = [a, b].filter((r) => r.status === 'fulfilled')
    const recusado = [a, b].filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(ok).toHaveLength(1)
    expect(recusado).toHaveLength(1)
    expect(String(recusado[0].reason?.message)).toMatch(/já está sendo enviada/)
    expect(posts()).toHaveLength(1)
    expect(notas()).toHaveLength(1)
    expect(rascunho('r1').status).toBe('emitida')

    // E um terceiro envio depois de emitido devolve a nota existente, sem POST.
    const c = await processarEmissao(input, UID)
    expect(c).toMatchObject({ sucesso: true, jaEmitida: true, numeroNfse: '123' })
    expect(posts()).toHaveLength(1)
  })

  it('emissão direta (sem rascunho salvo): dois cliques com a mesma chave → um rascunho, um nDPS, uma nota', async () => {
    sefin.aoEmitir = async (req) => {
      await new Promise((r) => setTimeout(r, 30))
      return emitirNaSefin(req)
    }
    const chave = 'chave-idempotencia-0001'
    const r = await Promise.allSettled([
      chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: chave }),
      chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: chave }),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(posts()).toHaveLength(1)
    expect(notas()).toHaveLength(1)
    const rascunhos = ctx.db.colecaoInteira('nfse_rascunhos')
    expect(rascunhos).toHaveLength(1)
    expect(rascunhos[0].id).toBe(`emissao_${chave}`)
    expect(rascunhos[0]).toMatchObject({ status: 'emitida', origem: 'emissao_direta', tenantId: TENANT, clienteId: 'c1' })
    // nDPS reservado no rascunho e um único número consumido no contador.
    expect((rascunhos[0].dados as Record<string, unknown>).numeroRps).toBe('1')
    expect(ctx.db.colecaoInteira('dps_sequencias')[0]).toMatchObject({ ultimoNumero: 1 })
  })

  it('dado inválido não cria rascunho nem consome número', async () => {
    await expect(chamar(emitirModulo.emitirNfse, {
      ...inputDoFormulario({ tomador: { razaoSocial: 'X', cpfCnpj: '123' } }),
      chaveIdempotencia: 'chave-idempotencia-0002',
    })).rejects.toThrow(/não pode ser emitida.*CPF\/CNPJ do tomador inválido/)
    expect(ctx.db.colecaoInteira('nfse_rascunhos')).toHaveLength(0)
    expect(ctx.db.colecaoInteira('dps_sequencias')).toHaveLength(0)
    expect(posts()).toHaveLength(0)
  })

  it('o número da DPS enviado pelo navegador é ignorado (servidor aloca)', async () => {
    const r = await chamar(emitirModulo.emitirNfse, {
      ...inputDoFormulario({ numeroRps: '999', serieRps: '7' }),
      chaveIdempotencia: 'chave-idempotencia-0003',
    }) as { sucesso: boolean }
    expect(r.sucesso).toBe(true)
    const dps = descompactarXml((posts()[0].corpoJson as { dpsXmlGZipB64: string }).dpsXmlGZipB64)
    expect(dps).toContain('<nDPS>1</nDPS>')
    expect(dps).not.toContain('<nDPS>999</nDPS>')
  })
})

// ─── A2: nota fantasma ──────────────────────────────────────────────────────

describe.skipIf(!TEM_OPENSSL)('A2 — timeout e DPS repetida reconciliam sem reenviar', () => {
  it('timeout no envio (a nota saiu) → retry consulta a DPS, registra a nota e NÃO reenvia', async () => {
    criarRascunho('r1')
    // A Sefin gera a nota, mas a resposta se perde (timeout do transporte).
    sefin.aoEmitir = async (req) => {
      emitirNaSefin(req)
      throw new Error('tempo esgotado (90 s)')
    }
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    const r1 = await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    expect(r1).toMatchObject({ sucesso: false, codigoErro: 'SEFIN_SEM_RESPOSTA' })
    expect(r1.erro).toMatch(/NÃO crie outra nota/)
    expect(rascunho('r1')).toMatchObject({ status: 'erro_integracao', codigoErroUltimaTentativa: 'SEFIN_SEM_RESPOSTA' })
    expect(notas()).toHaveLength(0)

    sefin.aoEmitir = null
    const retry = await chamar(retryNfse, { rascunhoId: 'r1' })
    expect(retry.status).toBe('success')
    expect(retry.data.resultado).toMatchObject({ sucesso: true, reconciliada: true, numeroNfse: '123' })
    expect(posts()).toHaveLength(1) // só o envio original
    expect(sefin.pedidos.some((p) => /\/dps\/DPS/.test(p.url.pathname))).toBe(true)
    expect(notas()).toHaveLength(1)
    expect(notas()[0]).toMatchObject({ registradaPor: 'reconciliacao', numeroNfse: '123', chaveAcesso: CHAVE, rascunhoId: 'r1', tomadorNome: 'Tomador do Servidor Ltda' })
    expect(rascunho('r1').status).toBe('emitida')
  })

  it('formulário: timeout e novo clique com a mesma chave → reconcilia, nada de segunda nota', async () => {
    sefin.aoEmitir = async (req) => {
      emitirNaSefin(req)
      throw new Error('socket hang up')
    }
    const chave = 'chave-idempotencia-0004'
    const r1 = await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: chave })
    expect(r1).toMatchObject({ sucesso: false, codigoErro: 'SEFIN_SEM_RESPOSTA', rascunhoId: `emissao_${chave}` })
    sefin.aoEmitir = null
    const r2 = await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: chave })
    expect(r2).toMatchObject({ sucesso: true, reconciliada: true, numeroNfse: '123' })
    expect(posts()).toHaveLength(1)
    expect(notas()).toHaveLength(1)
  })

  it('timeout e a nota NÃO saiu → a consulta dá 404 e o reenvio usa o MESMO nDPS', async () => {
    criarRascunho('r1')
    sefin.aoEmitir = async () => { throw new Error('ECONNRESET') }
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    sefin.aoEmitir = null
    const r2 = await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    expect(r2).toMatchObject({ sucesso: true, numeroNfse: '123' })
    expect(r2.reconciliada).toBeUndefined()
    expect(posts()).toHaveLength(2)
    const ids = posts().map(idDpsDoCorpo)
    expect(ids[0]).toBe(ids[1]) // mesmo nDPS
    expect(notas()).toHaveLength(1)
  })

  it('consulta prévia sem resposta → não reenvia (NAO_CONFIRMADA)', async () => {
    criarRascunho('r1', { status: 'erro_integracao', dados: { ...dadosRascunho, numeroRps: '5', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' } })
    const base = rotaPadrao
    definirOpcoesConectorNacional({
      transporte: () => async (req) => {
        sefin.pedidos.push(req)
        if (/\/dps\//.test(req.url.pathname)) throw new Error('tempo esgotado (20 s)')
        return base(req)
      },
    })
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    const r = await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    expect(r).toMatchObject({ sucesso: false, codigoErro: 'NAO_CONFIRMADA' })
    expect(posts()).toHaveLength(0)
    expect(rascunho('r1')).toMatchObject({ status: 'erro_integracao', codigoErroUltimaTentativa: 'NAO_CONFIRMADA' })
  })

  it('E0014 (DPS já usada) → consulta e registra a nota existente', async () => {
    criarRascunho('r1', { status: 'erro_integracao', dados: { ...dadosRascunho, numeroRps: '1', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' } })
    // A Sefin já tem a nota, mas a consulta prévia ainda não a enxerga (corrida):
    // o POST volta E0014 e a segunda consulta acha.
    let consultas = 0
    const base = rotaPadrao
    definirOpcoesConectorNacional({
      transporte: () => async (req) => {
        sefin.pedidos.push(req)
        if (/\/dps\//.test(req.url.pathname) && consultas++ < 2) return json(404, {}) // as 2 formas do id
        return base(req)
      },
    })
    sefin.notas.set(idDps(1), CHAVE)
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    const r = await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    expect(r).toMatchObject({ sucesso: true, reconciliada: true, numeroNfse: '123' })
    expect(r.mensagem).toMatch(/já tinha gerado/)
    expect(notas()).toHaveLength(1)
    expect(rascunho('r1').status).toBe('emitida')
  })
})

// ─── Rotina de 15 min ───────────────────────────────────────────────────────

describe.skipIf(!TEM_OPENSSL)('Rotina de reconciliação', () => {
  it('rascunho preso em processando (function morreu) com nota na Sefin → registra e marca emitida', async () => {
    criarRascunho('r1', {
      status: 'processando',
      travaId: 'velha',
      travaExpiraEm: TimestampFalso.fromMillis(Date.now() - 1000),
      dados: { ...dadosRascunho, numeroRps: '1', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' },
    })
    sefin.notas.set(idDps(1), CHAVE)
    const r = await executarReconciliacaoNfse()
    expect(r.emitida).toBe(1)
    expect(posts()).toHaveLength(0)
    expect(rascunho('r1').status).toBe('emitida')
    expect(notas()[0]).toMatchObject({ registradaPor: 'reconciliacao', origemEmissao: 'automatica', numeroNfse: '123' })
  })

  it('trava ainda válida não é tocada; sem nota na Sefin libera para reenvio com o mesmo número', async () => {
    criarRascunho('vivo', { status: 'processando', travaExpiraEm: TimestampFalso.fromMillis(Date.now() + 60_000), dados: { ...dadosRascunho, numeroRps: '2', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' } })
    criarRascunho('morto', { status: 'erro_integracao', codigoErroUltimaTentativa: 'SEFIN_SEM_RESPOSTA', dados: { ...dadosRascunho, numeroRps: '3', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' } })
    const r = await executarReconciliacaoNfse()
    expect(r).toMatchObject({ ignorado: 1, nao_emitida: 1 })
    expect(rascunho('vivo').status).toBe('processando')
    expect(rascunho('morto')).toMatchObject({ status: 'erro_integracao', codigoErroUltimaTentativa: 'EMISSAO_NAO_GERADA' })
    expect((rascunho('morto').dados as Record<string, unknown>).numeroRps).toBe('3')
  })
})

// ─── A3: consulta não regride ───────────────────────────────────────────────

describe.skipIf(!TEM_OPENSSL)('A3 — consultarNfse', () => {
  function nota(status: string) {
    ctx.db.gravar(ctx.db.collection('nfse_emitidas').doc('n1'), {
      tenantId: TENANT, clienteId: 'c1', status, chaveAcesso: CHAVE, codigoVerificacao: CHAVE, numeroNfse: '123', provedorNfse: 'nacional',
    })
  }

  it('nota cancelada continua cancelada quando a Sefin só devolve o XML (sem evento)', async () => {
    nota('cancelada')
    const r = await chamar(consultarNfse, { nfseId: 'n1' }) as { status: string }
    expect(r.status).toBe('success')
    expect(ctx.db.dados('nfse_emitidas/n1')!.status).toBe('cancelada')
  })

  it('evento de cancelamento na Sefin → nota emitida passa a cancelada', async () => {
    nota('emitida')
    sefin.cancelada = true
    await chamar(consultarNfse, { nfseId: 'n1' })
    expect(ctx.db.dados('nfse_emitidas/n1')).toMatchObject({ status: 'cancelada', canceladaConfirmadaPorConsulta: true })
  })

  it('nota emitida sem evento continua emitida', async () => {
    nota('emitida')
    await chamar(consultarNfse, { nfseId: 'n1' })
    expect(ctx.db.dados('nfse_emitidas/n1')!.status).toBe('emitida')
  })
})

// ─── A4: chave global ───────────────────────────────────────────────────────

describe('A4 — produção pelo Ambiente Nacional exige a chave global', () => {
  const cfg = (over: Partial<ConfigFiscalCliente>) => configFiscal({ ambienteEmissao: 'producao', ...over }) as unknown as ConfigFiscalCliente

  it('producaoLiberada na config NÃO dispensa a chave global', async () => {
    expect(await isProducaoLiberadaPorConfigOuConector(cfg({ producaoLiberada: true }))).toBe(false)
  })

  it('chave global ligada libera; config com false explícito bloqueia o cliente', async () => {
    ctx.db.gravar(ctx.db.collection('configuracoes').doc('nfse_nacional'), { producaoLiberada: true })
    expect(await isProducaoLiberadaPorConfigOuConector(cfg({}))).toBe(true)
    expect(await isProducaoLiberadaPorConfigOuConector(cfg({ producaoLiberada: true }))).toBe(true)
    expect(await isProducaoLiberadaPorConfigOuConector(cfg({ producaoLiberada: false }))).toBe(false)
  })

  it.skipIf(!TEM_OPENSSL)('emissão em produção sem a chave global é barrada antes de qualquer rede e sem rascunho', async () => {
    ctx.db = new FirestoreFalso()
    semear({ config: { ambienteEmissao: 'producao', producaoLiberada: true } })
    await expect(chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-idempotencia-0005' }))
      .rejects.toThrow(/não liberado para emissão em produção/)
    expect(sefin.pedidos).toHaveLength(0)
    expect(ctx.db.colecaoInteira('nfse_rascunhos')).toHaveLength(0)
  })

  it('config antiga com provedor da prefeitura também exige a chave global (emite pelo Nacional)', async () => {
    expect(await isProducaoLiberadaPorConfigOuConector(cfg({ provedorNfse: 'prefeitura', producaoLiberada: true }))).toBe(false)
  })
})

// ─── M3 / M8 ────────────────────────────────────────────────────────────────

describe.skipIf(!TEM_OPENSSL)('M3/M8 — vínculo do rascunho e lote pelo servidor', () => {
  it('rascunho de outro cliente não emite em nome deste', async () => {
    criarRascunho('r1')
    ctx.db.gravar(ctx.db.collection('clientes_fiscal').doc('f2'), configFiscal({ clienteId: 'c2' }) as Record<string, unknown>)
    // Tomador ≠ c2 (o tomador padrão tem o CNPJ de c2 e cairia na pré-validação E0202).
    const tomador = { razaoSocial: 'Prestador Teste Ltda', cpfCnpj: '11222333000181' }
    await expect(processarEmissao({ ...inputDoFormulario({ tomador }), clienteId: 'c2', rascunhoId: 'r1' }, UID))
      .rejects.toThrow(/não pertence a este cliente/)
    expect(posts()).toHaveLength(0)
  })

  it('rascunho de outro tenant é recusado', async () => {
    criarRascunho('r1', { tenantId: 'outro' })
    await expect(processarEmissao({ ...inputDoFormulario(), rascunhoId: 'r1' }, UID)).rejects.toThrow(/outro tenant/)
  })

  it('lote relê o rascunho do servidor e ignora o payload do navegador', async () => {
    criarRascunho('r1')
    criarRascunho('r2', { dados: { ...dadosRascunho, valorServico: 2000 } })
    const r = await chamar(emitirNfseLote, {
      // Formato antigo com payload adulterado: só o rascunhoId vale.
      itens: [
        { rascunhoId: 'r1', clienteId: 'c1', tomador: { razaoSocial: 'ADULTERADO', cpfCnpj: '11444777000161' }, servico: { valorServico: 1 } },
        { rascunhoId: 'r2' },
      ],
    })
    expect(r.sucessos).toBe(2)
    expect(r.resultados.map((x: { rascunhoId: string }) => x.rascunhoId)).toEqual(['r1', 'r2'])
    const dpsXml = posts().map((p) => descompactarXml((p.corpoJson as { dpsXmlGZipB64: string }).dpsXmlGZipB64))
    expect(dpsXml[0]).toContain('Tomador do Servidor Ltda')
    expect(dpsXml[0]).not.toContain('ADULTERADO')
    expect(dpsXml[0]).toContain('<vServ>1000.00</vServ>')
    expect(dpsXml[1]).toContain('<vServ>2000.00</vServ>')
    // Campos que o lote antigo perdia (M7): NBS do rascunho chega à DPS.
    expect(dpsXml[0]).toContain('113022100')
    expect(notas()).toHaveLength(2)
  })
})

// ─── Pré-validação fiscal: bloqueio antes de reservar nDPS ou chamar a Sefin ─

describe.skipIf(!TEM_OPENSSL)('pré-validação fiscal no servidor', () => {
  const imovel = { ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '020101' }

  it('formulário com cIndOp de imóvel (E0932): failed-precondition, sem rascunho, sem nDPS, sem Sefin', async () => {
    const erro = await chamar(emitirModulo.emitirNfse, {
      ...inputDoFormulario({ servico: { ...inputDoFormulario().servico, ...imovel } }),
      chaveIdempotencia: 'chave-pre-validacao-0001',
    }).catch((e: unknown) => e) as { code?: string; message?: string; details?: { codigo: string; bloqueios: { regra: string; codigoSefin: string | null }[] } }
    expect(erro.code).toBe('failed-precondition')
    expect(erro.message).toMatch(/indicador de operação 020101/)
    expect(erro.details?.codigo).toBe('PRE_VALIDACAO')
    expect(erro.details?.bloqueios.map((b) => b.codigoSefin)).toContain('E0932')
    expect(ctx.db.colecaoInteira('nfse_rascunhos')).toHaveLength(0)
    expect(ctx.db.colecaoInteira('dps_sequencias')).toHaveLength(0)
    expect(sefin.pedidos).toHaveLength(0)
  })

  it('IBS/CBS sem NBS (E0322) também bloqueia antes do envio', async () => {
    const servico = { ...inputDoFormulario().servico, codigoNbs: undefined, ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '100301' }
    await expect(processarEmissao(inputDoFormulario({ servico }), UID, { chaveIdempotencia: 'chave-pre-validacao-0002', persistirDados: true }))
      .rejects.toThrow(/NBS é obrigatório/)
    expect(ctx.db.colecaoInteira('dps_sequencias')).toHaveLength(0)
    expect(sefin.pedidos).toHaveLength(0)
  })

  it('lote: rascunho bloqueado não consome número, é marcado e não impede os outros', async () => {
    criarRascunho('r1', { dados: { ...dadosRascunho, ...imovel } })
    criarRascunho('r2')
    const r = await chamar(emitirNfseLote, { rascunhoIds: ['r1', 'r2'] })
    expect(r.sucessos).toBe(1)
    expect(r.resultados[0]).toMatchObject({ rascunhoId: 'r1', sucesso: false })
    expect(r.resultados[0].erro).toMatch(/não pode ser emitida/)
    // Só a nota boa chegou à Sefin e só ela consumiu número.
    expect(posts()).toHaveLength(1)
    expect(ctx.db.colecaoInteira('dps_sequencias')[0]).toMatchObject({ ultimoNumero: 1 })
    const r1 = rascunho('r1')
    expect(r1.status).toBe('aguardando_emissao')
    expect((r1.dados as Record<string, unknown>).numeroRps).toBeUndefined()
    expect(r1.preValidacao).toMatchObject({ bloqueado: true })
    expect(JSON.stringify(r1.preValidacao)).toContain('E0932')
  })

  it('config do cliente com cIndOp de imóvel bloqueia até o retry/cron (o padrão vale para toda nota)', async () => {
    ctx.db.gravar(ctx.db.collection('clientes_fiscal').doc('f1'), configFiscal({ ...imovel }) as Record<string, unknown>)
    criarRascunho('r1')
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    await expect(processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)).rejects.toThrow(/020101/)
    expect(sefin.pedidos).toHaveLength(0)
    expect(ctx.db.colecaoInteira('dps_sequencias')).toHaveLength(0)
  })

  it('NBS incompatível com o serviço (Anexo VIII) bloqueia', async () => {
    const servico = { ...inputDoFormulario().servico, codigoNbs: '1.0101.11.00' }
    await expect(processarEmissao(inputDoFormulario({ servico }), UID, { chaveIdempotencia: 'chave-pre-validacao-0003', persistirDados: true }))
      .rejects.toThrow(/não corresponde ao serviço 17\.19/)
    expect(sefin.pedidos).toHaveLength(0)
  })
})

// ─── Numeração da DPS: colisão com o Emissor Nacional web/app ───────────────

/** NFS-e "de fora" (emitida pelo site/app do governo) para a DPS nº n. */
function notaDeFora(n: number) {
  sefin.notas.set(idDps(n), chaveN(900 + n))
}

describe.skipIf(!TEM_OPENSSL)('E0014 com número novo — DPS usada fora da plataforma', { timeout: 30_000 }, () => {
  it('pula os números já usados, NÃO registra a nota de fora e o contador passa do colidido', async () => {
    notaDeFora(1)
    notaDeFora(2)
    const r = await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-colisao-00001' })
    expect(r).toMatchObject({ sucesso: true })
    expect(r.reconciliada).toBeUndefined()
    expect(r.mensagem).toMatch(/usados fora da plataforma.*nº 3/)
    expect(posts().map(idDpsDoCorpo)).toEqual([idDps(1), idDps(2), idDps(3)])
    expect(notas()).toHaveLength(1)
    expect(notas()[0]).toMatchObject({ numeroRps: '3', registradaPor: 'envio', tomadorNome: 'Tomador do Formulário Ltda' })
    expect(notas()[0].chaveAcesso).not.toBe(chaveN(901))
    expect(ctx.db.colecaoInteira('dps_sequencias')[0]).toMatchObject({ ultimoNumero: 3, ultimaColisaoNumero: 2 })

    // A próxima nota já sai com o 4 — sem colidir de novo.
    sefin.pedidos = []
    await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-colisao-00002' })
    expect(posts().map(idDpsDoCorpo)).toEqual([idDps(4)])
  })

  it('sem número livre no limite de saltos: erro claro, rascunho sem o número e contador adiantado', async () => {
    for (let n = 1; n <= emitirModulo.MAX_SALTOS_COLISAO + 1; n++) notaDeFora(n)
    const r = await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-colisao-00003' })
    expect(r).toMatchObject({ sucesso: false, codigoErro: 'DPS_NUMERO_EM_USO' })
    expect(r.erro).toMatch(/informe o próximo número da DPS/)
    expect(notas()).toHaveLength(0)
    const rasc = rascunho('emissao_chave-colisao-00003')
    expect(rasc).toMatchObject({ status: 'erro_integracao', codigoErroUltimaTentativa: 'DPS_NUMERO_EM_USO' })
    expect((rasc.dados as Record<string, unknown>).numeroRps).toBeNull()
    expect(ctx.db.colecaoInteira('dps_sequencias')[0].ultimoNumero).toBe(emitirModulo.MAX_SALTOS_COLISAO + 1)
  }, 30_000) // 6 envios assinados: lento com a suíte inteira em paralelo

  it('número reaproveitado cuja nota na Sefin é de OUTRO tomador: não registra, renumera e envia', async () => {
    criarRascunho('r1', { status: 'erro_integracao', dados: { ...dadosRascunho, numeroRps: '1', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' } })
    notaDeFora(1)
    const base = rotaPadrao
    definirOpcoesConectorNacional({
      transporte: () => async (req) => {
        sefin.pedidos.push(req)
        const m = req.url.pathname.match(/\/nfse\/([0-9A-Z]{50})$/)
        if (m && m[1] === chaveN(901)) {
          // NFS-e de fora: outro tomador, outro valor.
          const xml = `<NFSe><infNFSe Id="NFS${m[1]}"><nNFSe>77</nNFSe><DPS><infDPS><toma><CNPJ>99999999000191</CNPJ></toma><valores><vServPrest><vServ>5.00</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`
          return json(200, { chaveAcesso: m[1], nfseXmlGZipB64: compactarXml(xml) })
        }
        return base(req)
      },
    })
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    const r = await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    expect(r).toMatchObject({ sucesso: true })
    expect(r.reconciliada).toBeUndefined()
    expect(posts().map(idDpsDoCorpo)).toEqual([idDps(2)])
    expect(notas()).toHaveLength(1)
    expect(notas()[0]).toMatchObject({ numeroRps: '2', rascunhoId: 'r1' })
    expect(notas()[0].numeroNfse).not.toBe('77')
  })

  it('E0014 em número reaproveitado também avança o contador além do colidido', async () => {
    criarRascunho('r1', { status: 'erro_integracao', dados: { ...dadosRascunho, numeroRps: '9', serieRps: '1', provedorRps: 'nacional', tpAmbRps: '2' } })
    let consultas = 0
    const base = rotaPadrao
    definirOpcoesConectorNacional({
      transporte: () => async (req) => {
        sefin.pedidos.push(req)
        if (/\/dps\//.test(req.url.pathname) && consultas++ < 2) return json(404, {})
        return base(req)
      },
    })
    sefin.notas.set(idDps(9), CHAVE)
    const { normalizarRascunho } = await import('../../functions/src/nfse/normalizar-rascunho')
    const r = await processarEmissao(normalizarRascunho('r1', rascunho('r1')), UID)
    expect(r).toMatchObject({ sucesso: true, reconciliada: true })
    expect(ctx.db.colecaoInteira('dps_sequencias')[0]).toMatchObject({ ultimoNumero: 9 })
  })
})

describe.skipIf(!TEM_OPENSSL)('próximo número da DPS informado na configuração fiscal', () => {
  it('definirNumeracaoDps grava contador + config; a emissão sai com o número informado', async () => {
    const r = await chamar(emitirModulo.definirNumeracaoDps, { clienteId: 'c1', serie: '1', proximoNumero: 51 })
    expect(r).toMatchObject({ sucesso: true, serie: '1', proximoNumero: 51, ambiente: 'homologacao' })
    expect(ctx.db.dados('dps_sequencias/11222333000181_2_1')).toMatchObject({ ultimoNumero: 50 })
    expect(ctx.db.dados('clientes_fiscal/f1')).toMatchObject({ proximoNumeroDps: 51, serieDps: '1', numeracaoDpsAjuste: { serie: '1', tpAmb: '2' } })
    await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-proximo-000001' })
    expect(posts().map(idDpsDoCorpo)).toEqual([idDps(51)])
  })

  it('só avança: recusa número menor ou igual ao último já usado', async () => {
    await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-proximo-000002' })
    await expect(chamar(emitirModulo.definirNumeracaoDps, { clienteId: 'c1', serie: '1', proximoNumero: 1 }))
      .rejects.toThrow(/já usou a DPS nº 1/)
    await expect(chamar(emitirModulo.definirNumeracaoDps, { clienteId: 'c1', serie: '1', proximoNumero: 0 }))
      .rejects.toThrow(/inteiro/)
    expect(ctx.db.dados('dps_sequencias/11222333000181_2_1')).toMatchObject({ ultimoNumero: 1 })
  })

  it('piso da config vale mesmo com o contador perdido (backup restaurado sem dps_sequencias)', async () => {
    ctx.db.gravar(ctx.db.collection('clientes_fiscal').doc('f1'), configFiscal({ proximoNumeroDps: 40, numeracaoDpsAjuste: { serie: '1', tpAmb: '2' } }) as Record<string, unknown>)
    await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-proximo-000003' })
    expect(posts().map(idDpsDoCorpo)).toEqual([idDps(40)])
  })

  it('o log de auditoria leva nome/e-mail do token e o IP da chamada', async () => {
    await emitirModulo.definirNumeracaoDps.run({
      auth: { uid: UID, token: { name: 'Fiscal do Token', email: 'fiscal@exemplo.com' } },
      rawRequest: { ip: '203.0.113.7', headers: { 'user-agent': 'vitest' } },
      data: { clienteId: 'c1', serie: '1', proximoNumero: 10 },
    } as never)
    const log = ctx.db.colecaoInteira('logs_auditoria').find((l) => l.acao === 'definir_numeracao_dps')
    expect(log).toMatchObject({ usuarioId: UID, usuarioNome: 'Fiscal do Token', ip: '203.0.113.7', userAgent: 'vitest' })
  })
})

describe.skipIf(!TEM_OPENSSL)('emissão: auditoria com ator do token e IP', () => {
  it('emitirNfse grava no log o nome do token (não usuarios.nome) e o IP', async () => {
    await emitirModulo.emitirNfse.run({
      auth: { uid: UID, token: { name: 'Nome Assinado', email: 'f@exemplo.com' } },
      rawRequest: { ip: '198.51.100.9', headers: {} },
      data: { ...inputDoFormulario(), chaveIdempotencia: 'chave-auditoria-0001' },
    } as never)
    const log = ctx.db.colecaoInteira('logs_auditoria').find((l) => l.acao === 'emissao_nfse_sucesso')
    expect(log).toMatchObject({ usuarioNome: 'Nome Assinado', usuarioEmail: 'f@exemplo.com', ip: '198.51.100.9' })
  })
})

describe.skipIf(!TEM_OPENSSL)('uma configuração fiscal por cliente', () => {
  it('doc de id = clienteId vence um antigo de auto-id', async () => {
    ctx.db.gravar(ctx.db.collection('clientes_fiscal').doc('c1'), configFiscal({ serieDps: '7' }) as Record<string, unknown>)
    await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-config-000001' })
    expect(idDpsDoCorpo(posts()[0])).toContain('00007000000000000001')
  })

  it('sem o canônico, dois antigos: vale o mais recente (atualizadoEm), não o primeiro da consulta', async () => {
    ctx.db.gravar(ctx.db.collection('clientes_fiscal').doc('f1'), { ...configFiscal({ serieDps: '3' }), atualizadoEm: TimestampFalso.fromMillis(1_000) } as Record<string, unknown>)
    ctx.db.gravar(ctx.db.collection('clientes_fiscal').doc('f0'), { ...configFiscal({ serieDps: '5' }), atualizadoEm: TimestampFalso.fromMillis(9_000) } as Record<string, unknown>)
    await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-config-000002' })
    expect(idDpsDoCorpo(posts()[0])).toContain('00005000000000000001')
  })
})

describe.skipIf(!TEM_OPENSSL)('certificado A1 cifrado no Storage', () => {
  it('uploadCertificado grava o .pfx cifrado e a emissão continua assinando com ele', async () => {
    const r = await chamar(emitirModulo.uploadCertificado, { clienteId: 'c1', pfxBase64, senha: 'teste' })
    expect(r.sucesso).toBe(true)
    const gravado = ctx.storage.get('certificados/c1.pfx.b64')!
    expect(gravado.subarray(0, 4).toString('ascii')).toBe('JPC1')
    expect(gravado.includes(Buffer.from(pfxBase64, 'base64').subarray(0, 64))).toBe(false)
    const e = await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-cert-00000001' })
    expect(e).toMatchObject({ sucesso: true })
    expect(notas()).toHaveLength(1)
  })

  it('certificado legado em claro (binário DER) continua funcionando', async () => {
    ctx.storage.set('certificados/c1.pfx.b64', Buffer.from(pfxBase64, 'base64'))
    const e = await chamar(emitirModulo.emitirNfse, { ...inputDoFormulario(), chaveIdempotencia: 'chave-cert-00000002' })
    expect(e).toMatchObject({ sucesso: true })
  })

  it('validarCertificado continua validando o .pfx enviado pelo navegador', async () => {
    const v = await chamar(emitirModulo.validarCertificado, { pfxBase64, senha: 'teste' })
    expect(v.valido).toBe(true)
    await expect(chamar(emitirModulo.validarCertificado, { pfxBase64, senha: 'errada' })).rejects.toThrow(/senha incorreta/)
  })
})

// Fixa as dependências de tempo usadas acima (evita import morto).
void FieldValueFalso
