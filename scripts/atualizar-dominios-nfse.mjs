// Gera o catálogo oficial de opções da NFS-e Nacional a partir das fontes do
// governo (documentação de PRODUÇÃO em gov.br/nfse):
//   - Anexo A: municípios IBGE e países ISO2
//   - Anexo B: lista de serviços nacional (código de tributação) e NBS
//   - Anexo C: indicador de operação do IBS/CBS (cIndOp)
//   - XSD de produção (scripts/poc-nfse-nacional/schemas-producao): listas
//     fechadas dos campos codificados da DPS (regime especial, tributação do ISS…)
// Saída: src/lib/nfse-dominios/*.json. Uso: node scripts/atualizar-dominios-nfse.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const XLSX = require(path.join(raiz, 'node_modules/xlsx'))
const saida = path.join(raiz, 'src/lib/nfse-dominios')
const BASE = 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual'
const ANEXOS = {
  A: `${BASE}/anexo_a-municipio_ibge-paises_iso2-v1-00-snnfse-20251210.xlsx`,
  B: `${BASE}/anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx`,
  C: `${BASE}/anexo-c-indop-ibscbs-snnfse-v1-01.xlsx`,
}

async function baixar(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`)
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nfse-anexo-')), 'anexo.xlsx')
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()))
  return XLSX.readFile(f)
}
const linhas = (wb, aba) => XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: '' }).slice(1)
const limpa = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const grava = (nome, dados) => {
  fs.writeFileSync(path.join(saida, nome), JSON.stringify(dados) + '\n')
  console.log(`${nome}: ${Array.isArray(dados) ? dados.length : Object.keys(dados).length}`)
}

const a = await baixar(ANEXOS.A)
// UF pelos 2 primeiros dígitos do código IBGE (código da UF) — a coluna de UF
// da planilha não é confiável linha a linha.
const UF_POR_CODIGO = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN',
  25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC',
  43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
}
grava('municipios.json', linhas(a, 'TAB.MUN_IBGE')
  .filter((l) => /^\d{7}$/.test(String(l[3])))
  .map((l) => ({ ibge: String(l[3]), nome: limpa(l[2]), uf: UF_POR_CODIGO[String(l[3]).slice(0, 2)] ?? '' })))
grava('paises.json', linhas(a, 'TAB.PAÍS_ISO2')
  .filter((l) => /^[A-Z]{2}$/.test(String(l[0])))
  .map((l) => ({ codigo: String(l[0]), nome: limpa(l[1]) })))

const b = await baixar(ANEXOS.B)
// Código de tributação nacional = item(2) + subitem(2) + desdobro(2). Só as
// linhas com desdobro são códigos emitíveis; item/subitem são títulos.
grava('servicos-nacionais.json', linhas(b, 'LISTA.SERV.NAC.')
  .filter((l) => Number(l[3]) > 0)
  .map((l) => {
    const [i, s, d] = [l[1], l[2], l[3]].map((n) => String(n).padStart(2, '0'))
    return { codigo: `${i}${s}${d}`, rotulo: `${i}.${s}.${d}`, descricao: limpa(l[4]) }
  }))
grava('nbs.json', linhas(b, 'LISTA.NBS_v2.0')
  .filter((l) => limpa(l[0]))
  .map((l) => ({ codigo: limpa(l[0]), descricao: limpa(l[1]) })))

const c = await baixar(ANEXOS.C)
// Células mescladas: a descrição da operação só vem na primeira linha do grupo.
let descricaoAnterior = ''
grava('indicador-operacao.json', linhas(c, 'IndOp')
  .filter((l) => /^\d{6}$/.test(String(l[6])))
  .map((l) => {
    descricaoAnterior = limpa(l[3]) || limpa(l[1]) || descricaoAnterior
    return { codigo: String(l[6]), descricao: descricaoAnterior, local: limpa(l[7]) }
  }))

// Listas fechadas do XSD de produção (enumerations com a documentação oficial).
const xsd = fs.readFileSync(path.join(raiz, 'scripts/poc-nfse-nacional/schemas-producao/tiposSimples_v1.01.xsd'), 'utf8')
const enumeracoes = {}
for (const m of xsd.matchAll(/<xs:simpleType name="(\w+)">([\s\S]*?)<\/xs:simpleType>/g)) {
  // A descrição de cada valor vem no texto do tipo, no formato "1 - Operação tributável;".
  const doc = /<xs:documentation>([\s\S]*?)<\/xs:documentation>/.exec(m[2])?.[1] ?? ''
  const rotulos = new Map([...doc.matchAll(/^\s*([0-9A-Z]{1,3})\s*[-–]\s*(.+?);?\s*$/gm)].map((x) => [x[1], limpa(x[2]).replace(/;$/, '')]))
  const opcoes = [...m[2].matchAll(/<xs:enumeration value="([^"]*)"/g)]
    .map((e) => ({ valor: e[1], descricao: rotulos.get(e[1]) ?? '' }))
  if (opcoes.length) enumeracoes[m[1]] = opcoes
}
grava('enumeracoes-dps.json', enumeracoes)

// Anexo I: leiaute da DPS (descrição e notas de cada campo), regras de
// validação com o código de erro e, por código de tributação nacional, onde o
// ISSQN incide e qual grupo de detalhamento é obrigatório (obra, evento…).
const I = await baixar(`${BASE}/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx`)
const caminhoDps = (p, campo) => `${limpa(p).replace(/^.*?DPS\//, '').replace(/\/$/, '')}/${limpa(campo)}`
grava('leiaute-dps.json', linhas(I, 'LEIAUTE DPS_NFS-e ')
  .filter((l) => limpa(l[1]).includes('infDPS') && limpa(l[2]))
  .map((l) => ({
    caminho: caminhoDps(l[1], l[2]), elemento: limpa(l[3]), tipo: limpa(l[4]), ocorrencia: limpa(l[5]),
    tamanho: limpa(l[6]), descricao: limpa(l[7]), notas: limpa(l[8]) === '-' ? '' : limpa(l[8]),
  })))
grava('regras-dps.json', linhas(I, 'RN DPS_NFS-e')
  .filter((l) => limpa(l[1]).includes('infDPS') && /^E\d+/.test(limpa(l[7])))
  .map((l) => ({
    caminho: caminhoDps(l[1], l[2]), regra: limpa(l[3]), aplicacao: limpa(l[5]), efeito: limpa(l[6]),
    codigo: limpa(l[7]), mensagem: limpa(l[8]),
  })))
const marca = (v) => limpa(v).toUpperCase() === 'X'
grava('incidencia-servicos.json', linhas(I, 'MUN.INCID_INFO.SERV.')
  .filter((l) => /^\d{5,6}$/.test(String(l[0])))
  .map((l) => ({
    codigo: String(l[0]).padStart(6, '0'),
    // Local de incidência do ISSQN: estabelecimento do prestador (EP), local da
    // prestação (LP) ou estabelecimento do tomador (ET).
    incidencia: [marca(l[2]) && 'EP', marca(l[3]) && 'LP', marca(l[4]) && 'ET'].filter(Boolean),
    grupoObrigatorio: ['-', ''].includes(limpa(l[6])) ? null : limpa(l[6]),
  })))

// Classificação tributária do IBS/CBS (CST + cClassTrib): tabela oficial do
// Comitê Gestor/RFB publicada no portal da Conformidade Fácil (SVRS). Só os
// códigos marcados para NFS-e.
const cff = await (await fetch('https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria')).text()
const ini = cff.indexOf('var dadosOriginais = ')
if (ini < 0) throw new Error('Tabela cClassTrib não encontrada na página da Conformidade Fácil')
// O array vem embutido num <script>: corta no colchete que fecha o primeiro.
let fim = ini + 21
for (let prof = 0, emTexto = false; fim < cff.length; fim++) {
  const ch = cff[fim]
  if (emTexto) { if (ch === '\\') fim++; else if (ch === '"') emTexto = false; continue }
  if (ch === '"') emTexto = true
  else if (ch === '[' || ch === '{') prof++
  else if ((ch === ']' || ch === '}') && --prof === 0) break
}
const csts = JSON.parse(cff.slice(ini + 21, fim + 1))
grava('classificacao-ibscbs.json', csts.flatMap((cst) => cst.ClassificacoesTributarias
  .filter((c) => c.IndNfse)
  .map((c) => ({
    cst: cst.Cst, nomeCst: limpa(cst.NomeCst), cClassTrib: c.CodClassTrib, descricao: limpa(c.NomeClassTrib),
    reducaoIbs: c.PercRedIbs, reducaoCbs: c.PercRedCbs, tributacaoRegular: c.IndTribRegular,
    inicioVigencia: c.DthIniVig?.slice(0, 10) ?? null, fimVigencia: c.DthFimVig?.slice(0, 10) ?? null,
    legislacao: c.TexUrlLegislacao ?? null,
  }))))
