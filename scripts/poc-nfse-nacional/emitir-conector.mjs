#!/usr/bin/env node
// Exercita o NacionalConector DA PLATAFORMA (o mesmo código das Cloud Functions)
// contra a PRODUÇÃO RESTRITA, sem Firebase: sem Firestore, sem Storage, sem deploy.
//
//   cd functions && npm run build && cd ..
//   NFSE_PFX=~/certs/cliente.pfx NFSE_PFX_SENHA=... \
//     node scripts/poc-nfse-nacional/emitir-conector.mjs --dados ~/nota-conector.json [--consultar] [--cancelar "motivo com 15+ caracteres"]
//
// Travado: ambienteEmissao é SEMPRE 'homologacao' (tpAmb=2, hosts *.producaorestrita);
// não há opção para produção. O JSON de entrada (fora do repositório) tem o formato
// de scripts/poc-nfse-nacional/exemplo-conector.json.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const LIB = path.resolve(AQUI, '..', '..', 'functions', 'lib', 'nfse', 'provedores', 'nacional.js')

function args(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`Argumento inesperado: ${a}`)
    const prox = argv[i + 1]
    if (prox === undefined || prox.startsWith('--')) o[a.slice(2)] = true
    else { o[a.slice(2)] = prox; i++ }
  }
  return o
}

async function main() {
  const o = args(process.argv.slice(2))
  if (!existsSync(LIB)) throw new Error('Compile antes: cd functions && npm run build')
  if (typeof o.dados !== 'string') throw new Error('Falta --dados <arquivo.json> (ver exemplo-conector.json)')
  const pfx = process.env.NFSE_PFX
  const senha = process.env.NFSE_PFX_SENHA
  if (!pfx || !existsSync(pfx)) throw new Error('Defina NFSE_PFX com o caminho do .pfx do prestador')
  if (senha === undefined) throw new Error('Defina NFSE_PFX_SENHA')

  const { NacionalConector } = createRequire(import.meta.url)(LIB)
  const d = JSON.parse(readFileSync(o.dados, 'utf8'))
  const cert = { pfxBase64: readFileSync(pfx).toString('base64'), senha }
  const config = {
    clienteId: 'local',
    municipioEmissor: d.municipioEmissor ?? '',
    municipioIbge: d.prestador.municipioIbge,
    inscricaoMunicipal: d.prestador.inscricaoMunicipal ?? '',
    regimeTributario: d.regimeTributario ?? 'simples_nacional',
    optanteSimples: d.optanteSimples ?? true,
    incentivadorCultural: false,
    itemListaServico: d.itemListaServico,
    codigoTributacaoNacional: d.codigoTributacaoNacional,
    codigoTributacaoMunicipal: d.codigoTributacaoMunicipal,
    aliquotaPadrao: d.aliquotaPadrao,
    aliquotaSimplesNacional: d.aliquotaSimplesNacional,
    provedorNfse: 'nacional',
    ...(d.config ?? {}),
    ambienteEmissao: 'homologacao', // TRAVA: sempre produção restrita
  }
  const prestador = {
    cnpj: String(d.prestador.cnpj).replace(/\D/g, ''),
    inscricaoMunicipal: d.prestador.inscricaoMunicipal ?? '',
    razaoSocial: d.prestador.razaoSocial ?? 'Prestador',
    municipioIbge: d.prestador.municipioIbge,
  }
  const numero = String(o.numero ?? d.numero ?? Math.floor(Date.now() / 1000) % 1_000_000_000)
  const serie = String(o.serie ?? d.serie ?? '900')
  const input = { clienteId: 'local', tomador: d.tomador, servico: d.servico, numeroRps: numero, serieRps: serie }

  console.log(`Ambiente: PRODUÇÃO RESTRITA (tpAmb=2). DPS série ${serie}, número ${numero}.`)
  const conector = new NacionalConector()
  const r = await conector.emitir(input, config, cert, prestador)
  const { xmlNfse, ...resumo } = r
  console.log(JSON.stringify(resumo, null, 2))
  if (xmlNfse) console.log(`XML da NFS-e: ${xmlNfse.length} caracteres (não impresso).`)
  if (!r.sucesso && r.codigoErro !== 'SEFIN_SEM_RESPOSTA') process.exitCode = 1

  if (o.consultar || r.codigoErro === 'SEFIN_SEM_RESPOSTA') {
    const c = await conector.consultar(
      { nfseId: 'local', clienteId: 'local', codigoVerificacao: r.chaveAcesso, numeroRps: numero, serieRps: serie },
      config, cert, prestador,
    )
    console.log('Consulta:', JSON.stringify({ ...c, xmlNfse: c.xmlNfse ? `(${c.xmlNfse.length} caracteres)` : undefined }, null, 2))
  }
  if (typeof o.cancelar === 'string' && r.chaveAcesso) {
    const c = await conector.cancelar(
      { nfseId: 'local', clienteId: 'local', codigoVerificacao: r.chaveAcesso, motivo: o.cancelar },
      config, cert, prestador,
    )
    console.log('Cancelamento:', JSON.stringify(c, null, 2))
  }
}

main().catch((e) => {
  console.error(`FALHOU${e?.code ? ` [${e.code}]` : ''}: ${e?.message ?? e}`)
  if (e?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || e?.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    console.error('Dica: rode com NODE_OPTIONS=--use-system-ca.')
  }
  process.exit(1)
})
