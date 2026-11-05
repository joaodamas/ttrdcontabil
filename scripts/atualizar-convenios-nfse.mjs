// Atualiza o mapa de convênios NFS-e de TODOS os municípios na PRODUÇÃO do
// Sistema Nacional (só leitura: GET /parametrizacao/{ibge}/convenio).
// Gera src/lib/nfse-nacional-convenios.json (usado pela plataforma) e
// docs/nfse-nacional-convenios-AAAA-MM-DD.csv (leitura humana).
//
// Precisa de um certificado A1 válido qualquer (a API exige mTLS) em PEM:
//   openssl pkcs12 -legacy -in cliente.pfx -nodes -out /tmp/a1.pem   (fora do repo!)
//   NFSE_PEM=/tmp/a1.pem node scripts/atualizar-convenios-nfse.mjs
// Leva ~20 min (5.571 municípios, 6 conexões, com pausa entre chamadas).
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
const pemPath = process.env.NFSE_PEM
if (!pemPath) { console.error('Defina NFSE_PEM (certificado A1 em PEM, fora do repositório).'); process.exit(1) }
const pem = fs.readFileSync(pemPath, 'utf8')
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(os.tmpdir(), 'convenios-nfse-parcial.json')
const agent = new https.Agent({ cert: pem, key: pem, keepAlive: true, maxSockets: 6 })
let lista = []
async function carregarMunicipios() {
  const body = await new Promise((resolve, reject) => {
    https.get('https://servicodados.ibge.gov.br/api/v1/localidades/municipios', (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve(b))
    }).on('error', reject)
  })
  lista = JSON.parse(body).map((m) => ({
  ibge: String(m.id),
  nome: m.nome,
    uf: m.microrregiao?.mesorregiao?.UF?.sigla ?? m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ?? '',
  }))
}
const res = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {}

function get(ibge) {
  return new Promise((resolve) => {
    const req = https.get({ host: 'adn.nfse.gov.br', path: `/parametrizacao/${ibge}/convenio`, agent, timeout: 20000 }, (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve({ status: r.statusCode, body: b }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e) => resolve({ status: 0, body: String(e.message) }))
  })
}
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

async function consultar(m) {
  for (let t = 0; t < 4; t++) {
    const { status, body } = await get(m.ibge)
    if (status === 200 || status === 404) {
      let j = {}; try { j = JSON.parse(body) } catch {}
      return { ...m, status, ...(j.parametrosConvenio ?? {}), mensagem: status === 404 ? j.mensagem : undefined }
    }
    await dorme(1500 * (t + 1))
  }
  return { ...m, status: 'erro' }
}

;(async () => {
  await carregarMunicipios()
  const pendentes = lista.filter((m) => !res[m.ibge] || res[m.ibge].status === 'erro')
  let i = 0, feitos = 0
  async function worker() {
    while (i < pendentes.length) {
      const m = pendentes[i++]
      res[m.ibge] = await consultar(m)
      if (++feitos % 250 === 0) { fs.writeFileSync(outPath, JSON.stringify(res)); console.log(`${feitos}/${pendentes.length}`) }
      await dorme(60)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  fs.writeFileSync(outPath, JSON.stringify(res))
  const v = Object.values(res)
  const cat = (x) => (x.status === 404 ? 'S' : x.aderenteEmissorNacional === 1 ? 'E' : 'A')
  const hoje = new Date().toISOString().slice(0, 10)
  const municipios = Object.fromEntries(Object.keys(res).sort().map((k) => [k, cat(res[k])]))
  fs.writeFileSync(path.join(raiz, 'src/lib/nfse-nacional-convenios.json'), JSON.stringify({
    consultadoEm: hoje,
    fonte: 'adn.nfse.gov.br/parametrizacao/{ibge}/convenio (produção)',
    legenda: { E: 'emite pelo Emissor Nacional', A: 'só Ambiente Nacional (emissão no sistema da prefeitura)', S: 'sem convênio' },
    municipios,
  }))
  const rotulo = { E: 'emite pelo Nacional', A: 'sistema da prefeitura', S: 'sem convênio' }
  const linhas = ['ibge,municipio,uf,situacao,aderenteAmbienteNacional,aderenteEmissorNacional']
  for (const x of v.sort((a, b) => (a.uf + a.nome).localeCompare(b.uf + b.nome, 'pt-BR'))) {
    linhas.push([x.ibge, `"${x.nome}"`, x.uf, rotulo[cat(x)], x.aderenteAmbienteNacional ?? '', x.aderenteEmissorNacional ?? ''].join(','))
  }
  fs.writeFileSync(path.join(raiz, `docs/nfse-nacional-convenios-${hoje}.csv`), linhas.join('\n') + '\n')
  if (v.every((x) => x.status !== 'erro')) fs.rmSync(outPath, { force: true })
  console.log('total', v.length, '| emissor nacional', v.filter((x) => x.aderenteEmissorNacional === 1).length,
    '| só ambiente nacional', v.filter((x) => x.aderenteAmbienteNacional === 1 && x.aderenteEmissorNacional !== 1).length,
    '| sem convênio', v.filter((x) => x.status === 404).length, '| erro', v.filter((x) => x.status === 'erro').length)
})()
