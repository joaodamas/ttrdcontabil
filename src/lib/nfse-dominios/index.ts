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
import leiauteDps from './leiaute-dps.json'
import regrasDps from './regras-dps.json'
import incidenciaServicos from './incidencia-servicos.json'
import classificacaoIbsCbs from './classificacao-ibscbs.json'

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

export interface CampoLeiaute {
  caminho: string
  elemento: string
  tipo: string
  ocorrencia: string
  tamanho: string
  descricao: string
  notas: string
}

export interface RegraDps {
  caminho: string
  regra: string
  aplicacao: string
  efeito: string
  codigo: string
  mensagem: string
}

export interface ClassificacaoIbsCbs {
  cst: string
  nomeCst: string
  cClassTrib: string
  descricao: string
  reducaoIbs: number
  reducaoCbs: number
  tributacaoRegular: boolean
  inicioVigencia: string | null
  fimVigencia: string | null
  legislacao: string | null
}

export const LEIAUTE_DPS = leiauteDps as CampoLeiaute[]
export const REGRAS_DPS = regrasDps as RegraDps[]
export const CLASSIFICACAO_IBSCBS = classificacaoIbsCbs as ClassificacaoIbsCbs[]

/** Descrição oficial do campo (Anexo I). Caminho a partir de infDPS, ex.: 'infDPS/serv/cServ/cNBS'. */
export const campoLeiaute = (caminho: string) => LEIAUTE_DPS.find((c) => c.caminho === caminho)

/** Regras de rejeição/alerta do campo, com o código de erro da Sefin (Anexo I). */
export const regrasDoCampo = (caminho: string) => REGRAS_DPS.filter((r) => r.caminho === caminho)

/** Onde o ISSQN incide (EP prestador, LP local da prestação, ET tomador) e grupo obrigatório do serviço. */
export function incidenciaDoServico(cTribNac: string) {
  return (incidenciaServicos as { codigo: string; incidencia: string[]; grupoObrigatorio: string | null }[])
    .find((s) => s.codigo === cTribNac.replace(/\D/g, '').padStart(6, '0'))
}

/** CST do IBS/CBS que têm ao menos uma classificação válida para NFS-e. */
export const CST_IBSCBS: OpcaoCatalogo[] = [...new Map(CLASSIFICACAO_IBSCBS.map((c) => [c.cst, c.nomeCst]))]
  .map(([codigo, nome]) => ({ codigo, rotulo: codigo, descricao: nome }))

/** cClassTrib vigentes na data (AAAA-MM-DD), opcionalmente de um CST. */
export function classificacoesIbsCbs(data: string, cst?: string): OpcaoCatalogo[] {
  return CLASSIFICACAO_IBSCBS
    .filter((c) => (!cst || c.cst === cst)
      && (!c.inicioVigencia || c.inicioVigencia <= data) && (!c.fimVigencia || c.fimVigencia >= data))
    .map((c) => ({
      codigo: c.cClassTrib,
      rotulo: c.cClassTrib,
      descricao: `${c.descricao}${c.reducaoIbs || c.reducaoCbs ? ` (redução IBS ${c.reducaoIbs}% / CBS ${c.reducaoCbs}%)` : ''}`,
    }))
}
