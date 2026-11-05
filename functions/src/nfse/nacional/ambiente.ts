/**
 * Trava de ambiente + empacotamento da NFS-e Nacional (Sefin Nacional / ADN).
 *
 * TRAVA DURA POR AMBIENTE:
 *   - 'homologacao' → SÓ os hosts da PRODUÇÃO RESTRITA (tpAmb = 2);
 *   - 'producao'    → SÓ os hosts oficiais de PRODUÇÃO (tpAmb = 1).
 * Qualquer outro host (ou o host do outro ambiente) é recusado ANTES de abrir
 * conexão. Não há variável de ambiente que mude isso.
 *
 * O PoC (scripts/poc-nfse-nacional/cli.mjs) usa só as funções "ProducaoRestrita"
 * abaixo (assertUrlProducaoRestrita, montarUrl, assertXmlHomologacao), que são
 * travadas em homologação e não recebem parâmetro de ambiente.
 *
 * Sem imports relativos: o arquivo roda direto no Node (type stripping) a partir
 * do cli.mjs, além de ser compilado nas Functions e importado pelo vitest.
 */
import { gunzipSync, gzipSync } from 'node:zlib'

export type AmbienteNacional = 'homologacao' | 'producao'

/** tpAmb do leiaute nacional: 1 = Produção; 2 = Homologação (produção restrita). */
export const TP_AMB: Record<AmbienteNacional, '1' | '2'> = {
  producao: '1',
  homologacao: '2',
}

export const HOSTS_PRODUCAO_RESTRITA = [
  'sefin.producaorestrita.nfse.gov.br',
  'adn.producaorestrita.nfse.gov.br',
] as const

/** Hosts oficiais de produção (gov.br/nfse → "APIs – produção restrita e produção"). */
export const HOSTS_PRODUCAO = ['sefin.nfse.gov.br', 'adn.nfse.gov.br'] as const

/** Alias histórico do PoC: hosts que o PoC nunca pode tocar. */
export const HOSTS_PRODUCAO_PROIBIDOS = HOSTS_PRODUCAO

export const HOSTS_POR_AMBIENTE: Record<AmbienteNacional, readonly string[]> = {
  homologacao: HOSTS_PRODUCAO_RESTRITA,
  producao: HOSTS_PRODUCAO,
}

/**
 * Bases por ambiente. Confirmado na página oficial de APIs (gov.br/nfse):
 *   produção restrita: sefin.producaorestrita.nfse.gov.br/API/SefinNacional
 *   produção:          sefin.nfse.gov.br/SefinNacional   (sem o "/API")
 * Parametrização municipal: {adn}/parametrizacao nos dois ambientes.
 */
export const BASES_POR_AMBIENTE: Record<AmbienteNacional, { sefin: string; adn: string }> = {
  homologacao: {
    sefin: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional',
    adn: 'https://adn.producaorestrita.nfse.gov.br',
  },
  producao: {
    sefin: 'https://sefin.nfse.gov.br/SefinNacional',
    adn: 'https://adn.nfse.gov.br',
  },
}

/**
 * Bases da Sefin Nacional na produção restrita (PoC). /API/SefinNacional é o
 * link oficial do Swagger (confirmado em 05/11/2026 com o A1: aceitou o POST
 * /nfse); /SefinNacional fica como alternativa de diagnóstico do PoC.
 */
export const BASES_SEFIN = {
  api: BASES_POR_AMBIENTE.homologacao.sefin,
  raiz: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
} as const
export type BaseSefin = keyof typeof BASES_SEFIN

export const BASE_ADN = BASES_POR_AMBIENTE.homologacao.adn

export class AmbienteProibidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AmbienteProibidoError'
  }
}

export function ehAmbienteNacional(valor: unknown): valor is AmbienteNacional {
  return valor === 'homologacao' || valor === 'producao'
}

function rotuloAmbiente(ambiente: AmbienteNacional): string {
  return ambiente === 'producao' ? 'PRODUÇÃO' : 'PRODUÇÃO RESTRITA (homologação)'
}

/**
 * Recusa qualquer URL fora dos hosts do ambiente pedido. Devolve a URL parseada.
 * Homologação nunca alcança produção e produção nunca alcança a produção
 * restrita (nota de teste não pode "vazar" para o ambiente real e vice-versa).
 */
export function assertUrlDoAmbiente(url: string, ambiente: AmbienteNacional): URL {
  if (!ehAmbienteNacional(ambiente)) {
    throw new AmbienteProibidoError(`RECUSADO: ambiente desconhecido (${String(ambiente)})`)
  }
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new AmbienteProibidoError(`URL inválida: ${url}`)
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  const permitidos = HOSTS_POR_AMBIENTE[ambiente]
  if (!permitidos.includes(host)) {
    const outro: AmbienteNacional = ambiente === 'producao' ? 'homologacao' : 'producao'
    if (HOSTS_POR_AMBIENTE[outro].includes(host)) {
      throw new AmbienteProibidoError(
        `RECUSADO: ${host} é ${rotuloAmbiente(outro)}, mas o ambiente configurado é ${rotuloAmbiente(ambiente)} (${permitidos.join(', ')}).`,
      )
    }
    throw new AmbienteProibidoError(`RECUSADO: host fora do ambiente ${rotuloAmbiente(ambiente)}: ${host}`)
  }
  if (u.protocol !== 'https:') throw new AmbienteProibidoError('RECUSADO: só HTTPS')
  if (u.port && u.port !== '443') throw new AmbienteProibidoError('RECUSADO: porta diferente de 443')
  if (u.username || u.password) throw new AmbienteProibidoError('RECUSADO: credencial embutida na URL')
  return u
}

/** Junta base + segmentos (cada segmento é codificado) e aplica a trava do ambiente. */
export function montarUrlDoAmbiente(ambiente: AmbienteNacional, base: string, ...segmentos: string[]): URL {
  const caminho = segmentos.map((s) => encodeURIComponent(s)).join('/')
  return assertUrlDoAmbiente(`${base.replace(/\/+$/, '')}/${caminho}`, ambiente)
}

/**
 * Confere, no XML que vai sair, que TODOS os tpAmb batem com o ambiente.
 * Pega DPS e pedido de evento. Falha fechado: sem tpAmb = recusa.
 */
export function assertXmlDoAmbiente(xml: string, ambiente: AmbienteNacional): void {
  if (!ehAmbienteNacional(ambiente)) {
    throw new AmbienteProibidoError(`RECUSADO: ambiente desconhecido (${String(ambiente)})`)
  }
  const esperado = TP_AMB[ambiente]
  const valores = [...xml.matchAll(/<tpAmb>\s*([^<]*?)\s*<\/tpAmb>/g)].map((m) => m[1])
  if (valores.length === 0) throw new AmbienteProibidoError('RECUSADO: XML sem <tpAmb>')
  if (valores.some((v) => v !== esperado)) {
    throw new AmbienteProibidoError(
      `RECUSADO: tpAmb diferente de ${esperado} para ${rotuloAmbiente(ambiente)} (encontrado: ${valores.join(', ')})`,
    )
  }
}

// ─── API travada do PoC (só produção restrita, sem parâmetro) ──────────────

/** Recusa qualquer URL fora da produção restrita. Devolve a URL já parseada. */
export function assertUrlProducaoRestrita(url: string): URL {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    throw new AmbienteProibidoError(`URL inválida: ${url}`)
  }
  if ((HOSTS_PRODUCAO as readonly string[]).includes(host)) {
    throw new AmbienteProibidoError(
      `RECUSADO: ${host} é PRODUÇÃO. Este PoC só fala com a produção restrita (${HOSTS_PRODUCAO_RESTRITA.join(', ')}).`,
    )
  }
  return assertUrlDoAmbiente(url, 'homologacao')
}

/** Junta base + segmentos e aplica a trava de produção restrita (PoC). */
export function montarUrl(base: string, ...segmentos: string[]): URL {
  const caminho = segmentos.map((s) => encodeURIComponent(s)).join('/')
  return assertUrlProducaoRestrita(`${base.replace(/\/+$/, '')}/${caminho}`)
}

/** PoC: o XML só sai com tpAmb = 2. */
export function assertXmlHomologacao(xml: string): void {
  assertXmlDoAmbiente(xml, 'homologacao')
}

// ─── Empacotamento ──────────────────────────────────────────────────────────

/** XML → gzip → base64 (campos *XmlGZipB64 da API). */
export function compactarXml(xml: string): string {
  return gzipSync(Buffer.from(xml, 'utf8')).toString('base64')
}

/** base64 → gunzip → XML. */
export function descompactarXml(b64: string): string {
  return gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')
}

export interface MensagemSefin {
  codigo?: string
  descricao?: string
  complemento?: string
}

function texto(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined
}

function lerMensagem(m: unknown): MensagemSefin | null {
  if (typeof m === 'string') return { descricao: m }
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  const msg: MensagemSefin = {
    codigo: texto(o.codigo ?? o.Codigo),
    descricao: texto(o.descricao ?? o.Descricao ?? o.mensagem ?? o.Mensagem),
    complemento: texto(o.complemento ?? o.Complemento),
  }
  return msg.codigo || msg.descricao || msg.complemento ? msg : null
}

function lerLista(v: unknown): MensagemSefin[] {
  const lista = Array.isArray(v) ? v : v ? [v] : []
  return lista.map(lerMensagem).filter((m): m is MensagemSefin => m !== null)
}

/**
 * Extrai erros e alertas de uma resposta JSON da Sefin/ADN. A API alterna
 * `erros`/`erro`/`Erros` e maiúsculas nos subcampos (confirmado: a produção
 * restrita devolve `erros: [{ Codigo, Descricao }]`) — aceita todos.
 */
export function extrairMensagens(corpo: unknown): { erros: MensagemSefin[]; alertas: MensagemSefin[] } {
  if (!corpo || typeof corpo !== 'object') return { erros: [], alertas: [] }
  const o = corpo as Record<string, unknown>
  return {
    erros: lerLista(o.erros ?? o.erro ?? o.Erros ?? o.Erro),
    alertas: lerLista(o.alertas ?? o.Alertas),
  }
}

export function formatarMensagem(m: MensagemSefin): string {
  const corpo = [m.descricao, m.complemento].filter(Boolean).join(' — ')
  return m.codigo ? `[${m.codigo}] ${corpo}` : corpo
}
