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
grava('indicador-operacao.json', linhas(c, 'IndOp')
  .filter((l) => /^\d{6}$/.test(String(l[6])))
  .map((l) => ({ codigo: String(l[6]), descricao: limpa(l[3]) || limpa(l[1]), local: limpa(l[7]) })))

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
