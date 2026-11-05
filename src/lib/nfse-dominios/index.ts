/**
 * Catálogo oficial de opções da NFS-e Nacional (gerado por
 * scripts/atualizar-dominios-nfse.mjs a partir dos anexos e do XSD de produção).
 */
import servicosNacionais from './servicos-nacionais.json'
import nbs from './nbs.json'
import municipios from './municipios.json'
import paises from './paises.json'
import indicadorOperacao from './indicador-operacao.json'
import enumeracoes from './enumeracoes-dps.json'

export interface OpcaoCatalogo {
  codigo: string
  rotulo: string
  descricao: string
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export const SERVICOS_NACIONAIS: OpcaoCatalogo[] = (servicosNacionais as { codigo: string; rotulo: string; descricao: string }[])
  .map((s) => ({ codigo: s.codigo, rotulo: s.rotulo, descricao: s.descricao }))

export const NBS: OpcaoCatalogo[] = (nbs as { codigo: string; descricao: string }[])
  .map((n) => ({ codigo: n.codigo, rotulo: n.codigo, descricao: n.descricao }))

export const MUNICIPIOS: OpcaoCatalogo[] = (municipios as { ibge: string; nome: string; uf: string }[])
  .map((m) => ({ codigo: m.ibge, rotulo: `${m.nome}/${m.uf}`, descricao: m.ibge }))

export const PAISES: OpcaoCatalogo[] = (paises as { codigo: string; nome: string }[])
  .map((p) => ({ codigo: p.codigo, rotulo: p.nome, descricao: p.codigo }))

export const INDICADOR_OPERACAO: OpcaoCatalogo[] = (indicadorOperacao as { codigo: string; descricao: string; local: string }[])
  .map((i) => ({ codigo: i.codigo, rotulo: i.codigo, descricao: `${i.descricao}${i.local ? ` — local: ${i.local}` : ''}` }))

/** Opções de um campo codificado da DPS pelo nome do tipo no XSD (ex.: 'TSTribISSQN'). */
export function opcoesDoTipo(tipoXsd: string): OpcaoCatalogo[] {
  const lista = (enumeracoes as Record<string, { valor: string; descricao: string }[]>)[tipoXsd] ?? []
  return lista.map((o) => ({ codigo: o.valor, rotulo: o.valor, descricao: o.descricao }))
}

/** Busca sem acento/caixa por código (com ou sem pontuação) ou descrição; todas as palavras precisam casar. */
export function buscarOpcoes(lista: OpcaoCatalogo[], busca: string, limite = 50): OpcaoCatalogo[] {
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean)
  if (!termos.length) return lista.slice(0, limite)
  const resultado: OpcaoCatalogo[] = []
  for (const o of lista) {
    const texto = normalizar(`${o.codigo} ${o.rotulo} ${o.descricao}`)
    const soDigitos = texto.replace(/[^0-9a-z ]/g, '')
    if (termos.every((t) => texto.includes(t) || soDigitos.includes(t.replace(/[^0-9a-z]/g, '')))) {
      resultado.push(o)
      if (resultado.length >= limite) break
    }
  }
  return resultado
}
