/**
 * Trava de ambiente + empacotamento do PoC NFS-e Nacional.
 *
 * TRAVA DURA: só os hosts da PRODUÇÃO RESTRITA passam. Produção
 * (sefin.nfse.gov.br, adn.nfse.gov.br) e qualquer outro host são recusados
 * ANTES de abrir conexão. Não há flag, variável de ambiente nem parâmetro que
 * mude isso — para usar produção é preciso alterar este arquivo, com revisão.
 *
 * Sem imports relativos (roda direto no Node a partir do cli.mjs).
 */
import { gunzipSync, gzipSync } from 'node:zlib'

export const HOSTS_PRODUCAO_RESTRITA = [
  'sefin.producaorestrita.nfse.gov.br',
  'adn.producaorestrita.nfse.gov.br',
] as const

/** Listados só para a mensagem de recusa ficar explícita; a regra é a allowlist acima. */
export const HOSTS_PRODUCAO_PROIBIDOS = ['sefin.nfse.gov.br', 'adn.nfse.gov.br'] as const

/**
 * Bases da Sefin Nacional na produção restrita. A documentação oficial aponta
 * o Swagger em /API/SefinNacional/docs/index; há bibliotecas abertas que usam
 * /SefinNacional. Os dois caminhos existem no servidor (respondem 403 sem
 * certificado, e não 404) — confirmar qual atende com o A1 (ver README).
 */
export const BASES_SEFIN = {
  api: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional',
  raiz: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
} as const
export type BaseSefin = keyof typeof BASES_SEFIN

export const BASE_ADN = 'https://adn.producaorestrita.nfse.gov.br'

export class AmbienteProibidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AmbienteProibidoError'
  }
}

/** Recusa qualquer URL fora da produção restrita. Devolve a URL já parseada. */
export function assertUrlProducaoRestrita(url: string): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new AmbienteProibidoError(`URL inválida: ${url}`)
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if ((HOSTS_PRODUCAO_PROIBIDOS as readonly string[]).includes(host)) {
    throw new AmbienteProibidoError(
      `RECUSADO: ${host} é PRODUÇÃO. Este PoC só fala com a produção restrita (${HOSTS_PRODUCAO_RESTRITA.join(', ')}).`,
    )
  }
  if (!(HOSTS_PRODUCAO_RESTRITA as readonly string[]).includes(host)) {
    throw new AmbienteProibidoError(`RECUSADO: host fora da produção restrita: ${host}`)
  }
  if (u.protocol !== 'https:') throw new AmbienteProibidoError('RECUSADO: só HTTPS')
  if (u.port && u.port !== '443') throw new AmbienteProibidoError('RECUSADO: porta diferente de 443')
  if (u.username || u.password) throw new AmbienteProibidoError('RECUSADO: credencial embutida na URL')
  return u
}

/** Junta base + segmentos (cada segmento é codificado) e aplica a trava. */
export function montarUrl(base: string, ...segmentos: string[]): URL {
  const caminho = segmentos.map((s) => encodeURIComponent(s)).join('/')
  return assertUrlProducaoRestrita(`${base.replace(/\/+$/, '')}/${caminho}`)
}

/**
 * Confere, no XML que vai sair, que o ambiente é 2 (homologação). Pega tanto a
 * DPS quanto o pedido de evento. Falha fechado: sem tpAmb = recusa.
 */
export function assertXmlHomologacao(xml: string): void {
  const valores = [...xml.matchAll(/<tpAmb>\s*([^<]*?)\s*<\/tpAmb>/g)].map((m) => m[1])
  if (valores.length === 0) throw new AmbienteProibidoError('RECUSADO: XML sem <tpAmb>')
  if (valores.some((v) => v !== '2')) {
    throw new AmbienteProibidoError(`RECUSADO: tpAmb diferente de 2 (encontrado: ${valores.join(', ')})`)
  }
}

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
 * `erros`/`erro`/`Erros` e maiúsculas nos subcampos — aceita todos.
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
