#!/usr/bin/env node
// PoC — emissão DIRETA de NFS-e pelo Sistema Nacional (Sefin Nacional / ADN),
// TRAVADO na PRODUÇÃO RESTRITA (tpAmb = 2). Sem integrador, sem dependência nova.
//
//   npm run poc:nfse -- <comando> [opções]      (ver README.md desta pasta)
//
// Segurança:
//   - hosts permitidos: sefin.producaorestrita.nfse.gov.br e adn.producaorestrita.nfse.gov.br
//     (functions/src/nfse/nacional/ambiente.ts recusa produção antes de abrir conexão);
//   - .pfx lido de --pfx ou NFSE_PFX; senha só por NFSE_PFX_SENHA ou digitada no terminal
//     (sem eco). A senha nunca é impressa nem gravada;
//   - requisições/respostas ficam em .poc-nfse/ (ignorado pelo git) — contêm dados reais.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BASES_SEFIN,
  BASE_ADN,
  assertXmlHomologacao,
  compactarXml,
  descompactarXml,
  extrairMensagens,
  formatarMensagem,
  montarUrl,
} from '../../functions/src/nfse/nacional/ambiente.ts'
import {
  formatarDhEmi,
  instanteSeguroParaEmissao,
  montarDpsXml,
  montarPedidoCancelamentoXml,
  normalizarCnpj,
  somenteDigitos,
  validarDadosNota,
} from '../../functions/src/nfse/nacional/dps.ts'
import { assinarXml, extrairChaveDoPfx, validarCertificado } from '../../functions/src/nfse/xml/signer.ts'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ_REPO = path.resolve(AQUI, '..', '..')
const PASTA_SAIDA = path.join(RAIZ_REPO, '.poc-nfse')
const PASTA_SCHEMAS = path.join(AQUI, 'schemas')

// ─── Argumentos ─────────────────────────────────────────────────────────────

function lerArgs(argv) {
  const [comando, ...resto] = argv
  const opcoes = {}
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i]
    if (!a.startsWith('--')) throw new Error(`Argumento inesperado: ${a}`)
    const nome = a.slice(2)
    const prox = resto[i + 1]
    if (prox === undefined || prox.startsWith('--')) opcoes[nome] = true
    else {
      opcoes[nome] = prox
      i++
    }
  }
  return { comando, opcoes }
}

function exigir(opcoes, nome, dica) {
  const v = opcoes[nome]
  if (v === undefined || v === true || String(v).trim() === '') {
    throw new Error(`Falta --${nome}${dica ? ` (${dica})` : ''}`)
  }
  return String(v).trim()
}

const AJUDA = `
PoC NFS-e Nacional — PRODUÇÃO RESTRITA (tpAmb=2). Nenhum comando fala com produção.

Certificado A1 do prestador (obrigatório para tudo que vai à rede):
  --pfx <arquivo.pfx>   ou   NFSE_PFX=/caminho/cliente.pfx
  senha: NFSE_PFX_SENHA no ambiente, ou digitada no terminal (sem eco)

Comandos:
  certificado                                  mostra titular/validade do A1 (offline)
  convenio   --ibge <7 díg> [--via adn|sefin]  Etapa 1: o município tem convênio?
  parametros --ibge <7 díg> --servico <cTribNac> [--competencia AAAA-MM-DD] [--via adn|sefin]
  parametros --ibge <7 díg> --cnpj <cnpj>      retenções/benefícios do contribuinte (rota do manual)
  emitir     --dados <nota.json> [--sem-enviar]  Etapa 2: monta, assina, valida no XSD e envia a DPS
  consultar     --chave <chave de acesso>
  consultar-dps --id <Id da DPS>               HEAD + GET /dps/{id}
  cancelar   --chave <chave> --cnpj <autor> --motivo "<15 a 255 car.>" [--codigo 1|2|9] [--sem-enviar]
  danfse     --chave <chave>                   tenta baixar o PDF (API suspensa pela NT 008)

Opções gerais:
  --sefin api|raiz   base da Sefin: api = /API/SefinNacional (padrão, link oficial), raiz = /SefinNacional
`

// ─── Senha e certificado ────────────────────────────────────────────────────

function lerSenhaTty(rotulo) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) {
      reject(new Error('Sem terminal interativo para digitar a senha: defina NFSE_PFX_SENHA.'))
      return
    }
    process.stderr.write(rotulo)
    let senha = ''
    const limpar = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', aoDigitar)
    }
    const aoDigitar = (pedaco) => {
      for (const c of pedaco) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          limpar()
          process.stderr.write('\n')
          resolve(senha)
          return
        }
        if (c === '\u0003') {
          limpar()
          process.stderr.write('\n')
          reject(new Error('Cancelado.'))
          return
        }
        if (c === '\u007f' || c === '\b') senha = senha.slice(0, -1)
        else senha += c
      }
    }
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()
    stdin.on('data', aoDigitar)
  })
}

let certificadoCarregado = null

async function carregarCertificado(opcoes) {
  if (certificadoCarregado) return certificadoCarregado
  const caminho = (typeof opcoes.pfx === 'string' && opcoes.pfx) || process.env.NFSE_PFX
  if (!caminho) throw new Error('Informe o certificado A1: --pfx <arquivo> ou NFSE_PFX=<arquivo>.')
  if (!existsSync(caminho)) throw new Error(`Certificado não encontrado: ${caminho}`)
  const senha = process.env.NFSE_PFX_SENHA ?? (await lerSenhaTty('Senha do certificado A1 (não aparece na tela): '))
  const pfxBase64 = readFileSync(caminho).toString('base64')
  let chave
  let info
  try {
    chave = extrairChaveDoPfx(pfxBase64, senha)
    info = validarCertificado(pfxBase64, senha)
  } catch (e) {
    // Mensagem própria: o erro do node-forge não traz a senha, mas não vale arriscar.
    throw new Error(`Não foi possível abrir o .pfx (senha errada ou arquivo inválido): ${e?.message ?? 'erro'}`)
  }
  console.log(`Certificado: ${info.titular}`)
  console.log(`Validade:    até ${info.vencimento.toISOString().slice(0, 10)} ${info.valido ? '(válido)' : '(VENCIDO)'}`)
  if (!info.valido) throw new Error('Certificado vencido — a Sefin rejeitaria (E1203).')
  // mTLS com chave + cadeia em PEM (não o .pfx cru): .pfx ICP-Brasil antigos usam
  // cifras legadas (RC2/3DES) que o OpenSSL 3 do Node recusa no option `pfx`.
  const agente = new https.Agent({
    key: chave.privateKeyPem,
    cert: chave.certChainPem,
    keepAlive: false,
  })
  certificadoCarregado = { chave, info, agente }
  return certificadoCarregado
}

function avisarSeCnpjNaoBate(info, cnpj) {
  const doc = normalizarCnpj(cnpj)
  if (doc && !normalizarCnpj(info.titular).includes(doc)) {
    console.warn(`ATENÇÃO: o CNPJ ${doc} não aparece no titular do certificado (${info.titular}).`)
    console.warn('         A Sefin exige que a assinatura seja do emitente (E0718) — confira antes de enviar.')
  }
}

// ─── HTTP (mTLS) ────────────────────────────────────────────────────────────

function requisitar(url, { metodo = 'GET', corpoJson, agente, aceitar = 'application/json' } = {}) {
  // `url` já veio de montarUrl(), que aplica a trava de produção restrita.
  const corpo = corpoJson === undefined ? undefined : Buffer.from(JSON.stringify(corpoJson), 'utf8')
  const headers = { Accept: aceitar, 'User-Agent': 'ttrd-poc-nfse-nacional/0.1' }
  if (corpo) {
    headers['Content-Type'] = 'application/json'
    headers['Content-Length'] = String(corpo.length)
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: metodo, headers, agent: agente, timeout: 60_000 }, (res) => {
      const partes = []
      res.on('data', (c) => partes.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, corpo: Buffer.concat(partes) }))
    })
    req.on('timeout', () => req.destroy(new Error('tempo esgotado (60 s)')))
    req.on('error', reject)
    if (corpo) req.write(corpo)
    req.end()
  })
}

function lerJson(resp) {
  const texto = resp.corpo.toString('utf8')
  try {
    return { json: JSON.parse(texto), texto }
  } catch {
    return { json: null, texto }
  }
}

const EXPLICA_HTTP = {
  400: 'requisição recusada (formato/parâmetro)',
  401: 'não autorizado — certificado não aceito para esta operação',
  403: 'acesso negado — certificado ausente/recusado, ou o CNPJ não é ator da nota',
  404: 'não encontrado',
  429: 'muitas requisições — aguarde',
  495: 'certificado do cliente inválido',
  496: 'certificado do cliente não enviado',
  500: 'erro interno da Sefin',
  502: 'Sefin indisponível (gateway)',
  503: 'Sefin indisponível',
  504: 'Sefin sem resposta (gateway)',
}

function linhaStatus(resp) {
  const ex = EXPLICA_HTTP[resp.status]
  return `HTTP ${resp.status}${ex ? ` — ${ex}` : ''}`
}

/** Encurta strings enormes (base64) para imprimir. */
function resumir(valor) {
  return JSON.stringify(
    valor,
    (_k, v) => (typeof v === 'string' && v.length > 300 ? `${v.slice(0, 80)}… (${v.length} caracteres)` : v),
    2,
  )
}

function imprimirMensagens(json) {
  const { erros, alertas } = extrairMensagens(json)
  for (const e of erros) console.log(`  ERRO   ${formatarMensagem(e)}`)
  for (const a of alertas) console.log(`  ALERTA ${formatarMensagem(a)}`)
  return erros.length
}

// ─── Saída local (.poc-nfse/, ignorado pelo git) ────────────────────────────

function pastaExecucao(comando) {
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
  const pasta = path.join(PASTA_SAIDA, `${carimbo}-${comando}`)
  mkdirSync(pasta, { recursive: true, mode: 0o700 })
  return pasta
}

function salvar(pasta, nome, conteudo) {
  const arquivo = path.join(pasta, nome)
  writeFileSync(arquivo, conteudo, { mode: 0o600 })
  return path.relative(RAIZ_REPO, arquivo)
}

function salvarResposta(pasta, resp) {
  return salvar(
    pasta,
    'resposta.json',
    JSON.stringify({ status: resp.status, headers: resp.headers, corpo: resp.corpo.toString('utf8') }, null, 2),
  )
}

// ─── Validação no XSD (xmllint, se houver) ──────────────────────────────────

function validarNoXsd(arquivoXml, xsd) {
  const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', path.join(PASTA_SCHEMAS, xsd), arquivoXml], {
    encoding: 'utf8',
  })
  if (r.error) return { disponivel: false, ok: false, saida: '' }
  return { disponivel: true, ok: r.status === 0, saida: (r.stderr || r.stdout || '').trim() }
}

function exigirXsd(arquivo, xsd) {
  const v = validarNoXsd(path.join(RAIZ_REPO, arquivo), xsd)
  if (!v.disponivel) {
    console.warn('AVISO: xmllint não encontrado — XML NÃO validado no XSD antes do envio.')
    return
  }
  if (!v.ok) {
    console.error(v.saida)
    throw new Error(`XML não passa no ${xsd} — corrigir antes de enviar (seria E1235).`)
  }
  console.log(`XSD ${xsd}: válido.`)
}

/** xml-crypto/xmldom reserializam sem a declaração; sem ela a Sefin dá E1229. */
function comDeclaracao(xml) {
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`
}

function baseSefin(opcoes) {
  const qual = typeof opcoes.sefin === 'string' ? opcoes.sefin : 'api'
  if (!(qual in BASES_SEFIN)) throw new Error('--sefin aceita só "api" ou "raiz"')
  return BASES_SEFIN[qual]
}

function viaParametros(opcoes) {
  const via = typeof opcoes.via === 'string' ? opcoes.via : 'adn'
  if (via !== 'adn' && via !== 'sefin') throw new Error('--via aceita só "adn" ou "sefin"')
  return via
}

/** ADN /parametrizacao espera o código com pontos (ex.: 17.19.01.000). */
function codigoServicoComPontos(cod) {
  const d = somenteDigitos(cod)
  if (d.length === 6) return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}.000`
  if (d.length === 9) return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}.${d.slice(6, 9)}`
  return cod
}

async function getEImprimir(url, opcoes, rotulo) {
  const { agente } = await carregarCertificado(opcoes)
  console.log(`GET ${url.href}`)
  const resp = await requisitar(url, { agente })
  const pasta = pastaExecucao(rotulo)
  const salvo = salvarResposta(pasta, resp)
  console.log(linhaStatus(resp))
  const { json, texto } = lerJson(resp)
  if (json) {
    imprimirMensagens(json)
    console.log(resumir(json))
  } else if (texto.trim()) {
    console.log(texto.slice(0, 2000))
  }
  console.log(`Resposta salva em ${salvo}`)
  return { resp, json }
}

// ─── Comandos ───────────────────────────────────────────────────────────────

async function cmdCertificado(opcoes) {
  await carregarCertificado(opcoes)
  console.log('Certificado aberto com sucesso (nada foi enviado).')
}

async function cmdConvenio(opcoes) {
  const ibge = exigir(opcoes, 'ibge', '7 dígitos')
  if (!/^\d{7}$/.test(ibge)) throw new Error('--ibge deve ter 7 dígitos')
  const url =
    viaParametros(opcoes) === 'adn'
      ? montarUrl(BASE_ADN, 'parametrizacao', ibge, 'convenio')
      : montarUrl(baseSefin(opcoes), 'parametros_municipais', ibge, 'convenio')
  const { resp } = await getEImprimir(url, opcoes, 'convenio')
  if (resp.status === 200) console.log('\nOK: o município respondeu parâmetros de convênio (ver acima).')
  else if (resp.status === 404) console.log('\nSem convênio/parâmetros para este IBGE (ou rota diferente — tente --via sefin).')
}

async function cmdParametros(opcoes) {
  const ibge = exigir(opcoes, 'ibge', '7 dígitos')
  if (!/^\d{7}$/.test(ibge)) throw new Error('--ibge deve ter 7 dígitos')
  if (typeof opcoes.cnpj === 'string') {
    const doc = normalizarCnpj(opcoes.cnpj)
    await getEImprimir(montarUrl(baseSefin(opcoes), 'parametros_municipais', ibge, doc), opcoes, 'parametros-cnpj')
    return
  }
  const servico = exigir(opcoes, 'servico', 'cTribNac de 6 dígitos, ex.: 171901')
  if (viaParametros(opcoes) === 'sefin') {
    await getEImprimir(montarUrl(baseSefin(opcoes), 'parametros_municipais', ibge, servico), opcoes, 'parametros')
    return
  }
  const competencia = typeof opcoes.competencia === 'string' ? opcoes.competencia : formatarDhEmi(new Date()).slice(0, 8) + '01'
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(competencia)) throw new Error('--competencia: AAAA-MM-DD')
  const cod = codigoServicoComPontos(servico)
  await getEImprimir(
    montarUrl(BASE_ADN, 'parametrizacao', ibge, cod, `${competencia}T00:00:00`, 'aliquota'),
    opcoes,
    'parametros-aliquota',
  )
  await getEImprimir(
    montarUrl(BASE_ADN, 'parametrizacao', ibge, cod, `${competencia}T00:00:00`, 'regimes_especiais'),
    opcoes,
    'parametros-regimes',
  )
}

async function cmdEmitir(opcoes) {
  const arquivo = exigir(opcoes, 'dados', 'JSON da nota — ver exemplo-nota.json')
  const dados = JSON.parse(readFileSync(arquivo, 'utf8'))
  const problemas = validarDadosNota(dados)
  if (problemas.length) throw new Error('Dados da nota inválidos:\n  - ' + problemas.join('\n  - '))

  const dhEmi = formatarDhEmi(instanteSeguroParaEmissao(new Date()))
  const { xml, id } = montarDpsXml(dados, { dhEmi })
  assertXmlHomologacao(xml)
  const pasta = pastaExecucao('emitir')
  console.log(`DPS ${id}  (tpAmb=2, dhEmi=${dhEmi})`)
  const semAssinatura = salvar(pasta, 'dps-sem-assinatura.xml', xml)

  const temCertificado = Boolean((typeof opcoes.pfx === 'string' && opcoes.pfx) || process.env.NFSE_PFX)
  if (opcoes['sem-enviar'] && !temCertificado) {
    exigirXsd(semAssinatura, 'DPS_v1.01.xsd')
    console.log(`Sem certificado: DPS gerada SEM assinatura em ${semAssinatura}. Nada foi enviado.`)
    return
  }

  const { chave, info, agente } = await carregarCertificado(opcoes)
  avisarSeCnpjNaoBate(info, dados.prestador.cnpj)
  const assinado = comDeclaracao(assinarXml(xml, id, chave, { posicao: 'after' }))
  assertXmlHomologacao(assinado)
  const arqAssinado = salvar(pasta, 'dps-assinada.xml', assinado)
  exigirXsd(arqAssinado, 'DPS_v1.01.xsd')
  console.log(`DPS assinada: ${arqAssinado}`)
  if (opcoes['sem-enviar']) {
    console.log('--sem-enviar: nada foi enviado.')
    return
  }

  const url = montarUrl(baseSefin(opcoes), 'nfse')
  console.log(`POST ${url.href}`)
  const resp = await requisitar(url, { metodo: 'POST', corpoJson: { dpsXmlGZipB64: compactarXml(assinado) }, agente })
  console.log(linhaStatus(resp))
  console.log(`Resposta salva em ${salvarResposta(pasta, resp)}`)
  const { json, texto } = lerJson(resp)
  if (!json) {
    console.log(texto.slice(0, 2000))
    throw new Error('Resposta não é JSON — ver resposta.json')
  }
  const nErros = imprimirMensagens(json)
  const b64 = json.nfseXmlGZipB64
  if (b64) {
    const nfse = descompactarXml(b64)
    const arqNfse = salvar(pasta, 'nfse.xml', nfse)
    const nNFSe = nfse.match(/<nNFSe>([^<]+)<\/nNFSe>/)?.[1]
    console.log('\nSUCESSO: NFS-e gerada na produção restrita (sem validade jurídica).')
    console.log(`  chave de acesso: ${json.chaveAcesso ?? '(ver nfse.xml)'}`)
    if (nNFSe) console.log(`  número NFS-e:    ${nNFSe}`)
    console.log(`  XML da NFS-e:    ${arqNfse}`)
    console.log(`\nPróximos: consultar --chave ${json.chaveAcesso ?? '<chave>'}  |  cancelar --chave ... --cnpj ${dados.prestador.cnpj} --motivo "..."`)
    return
  }
  console.log(resumir(json))
  if (nErros) throw new Error('DPS REJEITADA — códigos acima (Anexo I, aba RN DPS_NFS-e).')
  throw new Error('Resposta sem nfseXmlGZipB64 — ver resposta.json')
}

async function cmdConsultar(opcoes) {
  const chave = normalizarCnpj(exigir(opcoes, 'chave', '50 posições'))
  const { resp, json } = await getEImprimir(montarUrl(baseSefin(opcoes), 'nfse', chave), opcoes, 'consultar')
  if (resp.status === 200 && json?.nfseXmlGZipB64) {
    const pasta = pastaExecucao('consultar-xml')
    console.log(`XML da NFS-e salvo em ${salvar(pasta, 'nfse.xml', descompactarXml(json.nfseXmlGZipB64))}`)
  }
}

async function cmdConsultarDps(opcoes) {
  const id = exigir(opcoes, 'id', '"DPS" + 42 dígitos, ou só os 42 dígitos')
  const { agente } = await carregarCertificado(opcoes)
  const url = montarUrl(baseSefin(opcoes), 'dps', id)
  console.log(`HEAD ${url.href}`)
  const head = await requisitar(url, { metodo: 'HEAD', agente })
  console.log(`${linhaStatus(head)}${head.status === 200 ? ' — NFS-e gerada para esta DPS' : ''}`)
  await getEImprimir(url, opcoes, 'consultar-dps')
}

async function cmdCancelar(opcoes) {
  const chaveAcesso = normalizarCnpj(exigir(opcoes, 'chave', '50 posições'))
  const autor = exigir(opcoes, 'cnpj', 'CNPJ do prestador — o mesmo do certificado')
  const motivo = exigir(opcoes, 'motivo', '15 a 255 caracteres')
  const codigoMotivo = Number(typeof opcoes.codigo === 'string' ? opcoes.codigo : 1)
  const { xml, id } = montarPedidoCancelamentoXml(
    { chaveAcesso, autorCpfCnpj: autor, codigoMotivo, motivo },
    { dhEvento: formatarDhEmi(instanteSeguroParaEmissao(new Date())) },
  )
  assertXmlHomologacao(xml)
  const { chave, info, agente } = await carregarCertificado(opcoes)
  avisarSeCnpjNaoBate(info, autor)
  const assinado = comDeclaracao(assinarXml(xml, id, chave, { posicao: 'after' }))
  assertXmlHomologacao(assinado)
  const pasta = pastaExecucao('cancelar')
  const arq = salvar(pasta, 'pedido-evento-assinado.xml', assinado)
  exigirXsd(arq, 'pedRegEvento_v1.01.xsd')
  console.log(`Pedido assinado: ${arq}`)
  if (opcoes['sem-enviar']) {
    console.log('--sem-enviar: nada foi enviado.')
    return
  }

  const url = montarUrl(baseSefin(opcoes), 'nfse', chaveAcesso, 'eventos')
  console.log(`POST ${url.href}  (evento 101101 — cancelamento)`)
  const resp = await requisitar(url, {
    metodo: 'POST',
    corpoJson: { pedidoRegistroEventoXmlGZipB64: compactarXml(assinado) },
    agente,
  })
  console.log(linhaStatus(resp))
  console.log(`Resposta salva em ${salvarResposta(pasta, resp)}`)
  const { json, texto } = lerJson(resp)
  if (!json) {
    console.log(texto.slice(0, 2000))
    throw new Error('Resposta não é JSON — ver resposta.json')
  }
  const nErros = imprimirMensagens(json)
  if (json.eventoXmlGZipB64) {
    console.log(`\nSUCESSO: cancelamento registrado. Evento em ${salvar(pasta, 'evento.xml', descompactarXml(json.eventoXmlGZipB64))}`)
    return
  }
  console.log(resumir(json))
  if (nErros) throw new Error('Pedido de cancelamento REJEITADO — códigos acima (Anexo II).')
}

async function cmdDanfse(opcoes) {
  const chave = normalizarCnpj(exigir(opcoes, 'chave', '50 posições'))
  const { agente } = await carregarCertificado(opcoes)
  const url = montarUrl(BASE_ADN, 'danfse', chave)
  console.log(`GET ${url.href}`)
  const resp = await requisitar(url, { agente, aceitar: 'application/pdf, application/json' })
  console.log(linhaStatus(resp))
  const tipo = String(resp.headers['content-type'] ?? '')
  const pasta = pastaExecucao('danfse')
  if (resp.status === 200 && (tipo.includes('pdf') || resp.corpo.subarray(0, 4).toString() === '%PDF')) {
    console.log(`SUCESSO: DANFSe salvo em ${salvar(pasta, `danfse-${chave}.pdf`, resp.corpo)}`)
    return
  }
  console.log(`Resposta salva em ${salvarResposta(pasta, resp)}`)
  console.log(
    '\nDANFSe INDISPONÍVEL pela API. A NT SE/CGNFS-e 008 (v1.02, 14/07/2026) suspendeu a API de geração do\n' +
      'DANFSe do ADN em 03/08/2026; o próprio sistema deve gerar o PDF a partir do XML da NFS-e seguindo o\n' +
      'leiaute da NT 008 (em produção restrita, com a tarja "NFS-e SEM VALIDADE JURÍDICA").',
  )
}

const COMANDOS = {
  certificado: cmdCertificado,
  convenio: cmdConvenio,
  parametros: cmdParametros,
  emitir: cmdEmitir,
  consultar: cmdConsultar,
  'consultar-dps': cmdConsultarDps,
  cancelar: cmdCancelar,
  danfse: cmdDanfse,
}

async function main() {
  const { comando, opcoes } = lerArgs(process.argv.slice(2))
  if (!comando || comando === 'ajuda' || comando === '--help' || opcoes.help) {
    console.log(AJUDA)
    return
  }
  const fn = COMANDOS[comando]
  if (!fn) throw new Error(`Comando desconhecido: ${comando}\n${AJUDA}`)
  console.log('Ambiente: PRODUÇÃO RESTRITA (tpAmb=2) — notas sem validade jurídica.\n')
  await fn(opcoes)
}

main().catch((e) => {
  const codigo = e?.code ? ` [${e.code}]` : ''
  console.error(`\nFALHOU${codigo}: ${e?.message ?? e}`)
  if (e?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || e?.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    console.error('Dica: rode com NODE_OPTIONS=--use-system-ca para usar as autoridades do sistema.')
  }
  process.exit(1)
})
