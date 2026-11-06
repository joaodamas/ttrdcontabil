// Catálogo compacto da pré-validação fiscal da NFS-e (functions/src/nfse/pre-validacao).
//
// O motor roda no navegador E nas Cloud Functions; as functions só publicam o
// que está em functions/, então as tabelas oficiais (src/lib/nfse-dominios e
// src/lib/nfse-nacional-convenios.json) são condensadas num JSON dentro de
// functions/. Este arquivo é a ÚNICA forma de gerá-lo; o teste
// __tests__/lib/nfse-pre-validacao-catalogo.test.ts falha se ele estiver
// desatualizado em relação às tabelas de src/.
//
// Uso: node scripts/catalogo-pre-validacao.mjs   (depois de atualizar-dominios-nfse.mjs
// ou atualizar-convenios-nfse.mjs)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SAIDA = path.join(raiz, 'functions/src/nfse/pre-validacao/catalogos.json')

const ler = (rel) => JSON.parse(fs.readFileSync(path.join(raiz, rel), 'utf8'))
const digitos = (v) => String(v ?? '').replace(/\D/g, '')

export function montarCatalogo() {
  const dom = 'src/lib/nfse-dominios'
  const convenios = ler('src/lib/nfse-nacional-convenios.json')
  const municipios = {}
  for (const m of ler(`${dom}/municipios.json`)) municipios[m.ibge] = convenios.municipios[m.ibge] ?? '?'
  const incidencia = {}
  for (const s of ler(`${dom}/incidencia-servicos.json`)) {
    incidencia[s.codigo] = { i: s.incidencia, g: s.grupoObrigatorio }
  }
  return {
    aviso: 'GERADO por scripts/catalogo-pre-validacao.mjs a partir de src/lib/nfse-dominios e src/lib/nfse-nacional-convenios.json — não editar à mão.',
    conveniosConsultadosEm: convenios.consultadoEm,
    servicos: ler(`${dom}/servicos-nacionais.json`).map((s) => s.codigo),
    nbs: ler(`${dom}/nbs.json`).map((n) => digitos(n.codigo)).filter((c) => c.length === 9),
    indicadoresOperacao: ler(`${dom}/indicador-operacao.json`).map((i) => i.codigo),
    classificacoes: ler(`${dom}/classificacao-ibscbs.json`).map((c) => ({
      cst: c.cst, cClassTrib: c.cClassTrib, inicio: c.inicioVigencia, fim: c.fimVigencia, regular: c.tributacaoRegular === true,
    })),
    incidencia,
    correlacaoItemNbs: ler(`${dom}/correlacao-item-nbs.json`).itens,
    municipios,
  }
}

export function serializar(catalogo) {
  return JSON.stringify(catalogo) + '\n'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(SAIDA, serializar(montarCatalogo()))
  console.log(`catálogo da pré-validação gravado em ${path.relative(raiz, SAIDA)}`)
}
