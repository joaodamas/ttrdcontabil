/**
 * Funções PURAS da emissão de NFS-e "a partir de algo que já existe":
 *  - variáveis de competência na descrição ({{MES_COMPETENCIA}}…);
 *  - competência padrão do cliente (mês atual / anterior / manual);
 *  - cópia de uma NFS-e emitida (campos gravados em nfse_emitidas, com o XML
 *    oficial como reserva) e do modelo padrão do cliente para o formulário.
 *
 * Sem Firestore e sem React: tudo aqui é testado em __tests__/lib/nfse-modelo.test.ts.
 */

// ─── Competência ────────────────────────────────────────────────────────────

export interface Competencia {
  /** 1 a 12. */
  mes: number
  ano: number
}

export type RegraCompetenciaPadrao = 'mes_atual' | 'mes_anterior' | 'manual'

export const REGRAS_COMPETENCIA: Array<{ valor: RegraCompetenciaPadrao; rotulo: string }> = [
  { valor: 'mes_atual', rotulo: 'Mês da emissão' },
  { valor: 'mes_anterior', rotulo: 'Mês anterior à emissão' },
  { valor: 'manual', rotulo: 'Escolher a cada nota' },
]

export function normalizarRegraCompetencia(valor: unknown): RegraCompetenciaPadrao {
  return valor === 'mes_anterior' || valor === 'manual' ? valor : 'mes_atual'
}

/** Competência que a regra do cliente sugere para uma nota emitida em `hoje`. 'manual' = nenhuma. */
export function competenciaPadrao(regra: RegraCompetenciaPadrao | undefined | null, hoje: Date): Competencia | null {
  const r = normalizarRegraCompetencia(regra)
  if (r === 'manual') return null
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()
  if (r === 'mes_atual') return { mes, ano }
  return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano }
}

/** "AAAA-MM" (valor de <input type="month">) → competência. Inválido = null. */
export function lerCompetencia(valor: string | undefined | null): Competencia | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(valor ?? '').trim())
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  if (mes < 1 || mes > 12 || ano < 2000) return null
  return { mes, ano }
}

/** Competência → "AAAA-MM" (valor do <input type="month">). */
export function competenciaParaInput(c: Competencia): string {
  return `${c.ano}-${String(c.mes).padStart(2, '0')}`
}

/** Competência → "AAAA-MM-01" (input.dataCompetencia da callable). */
export function competenciaParaData(c: Competencia): string {
  return `${competenciaParaInput(c)}-01`
}

/** Competência → "MM/AAAA". */
export function formatarCompetencia(c: Competencia | null | undefined): string {
  if (!c) return '—'
  return `${String(c.mes).padStart(2, '0')}/${c.ano}`
}

/** Competência depois do mês de `hoje` (a Sefin recusa competência futura). */
export function competenciaFutura(c: Competencia, hoje: Date): boolean {
  const atual = hoje.getFullYear() * 12 + hoje.getMonth()
  return c.ano * 12 + (c.mes - 1) > atual
}

// ─── Variáveis da descrição ─────────────────────────────────────────────────

export const MESES_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
] as const

export const VARIAVEIS_DESCRICAO = [
  { nome: '{{MES_COMPETENCIA}}', exemplo: 'OUTUBRO', ajuda: 'Mês da competência, por extenso' },
  { nome: '{{ANO_COMPETENCIA}}', exemplo: '2026', ajuda: 'Ano da competência' },
  { nome: '{{MES_ANO_COMPETENCIA}}', exemplo: '10/2026', ajuda: 'Mês/ano da competência' },
] as const

const RE_VARIAVEL = /\{\{\s*(MES_COMPETENCIA|ANO_COMPETENCIA|MES_ANO_COMPETENCIA)\s*\}\}/g

export function contemVariaveis(texto: string | undefined | null): boolean {
  return new RegExp(RE_VARIAVEL.source).test(String(texto ?? ''))
}

/**
 * Troca as variáveis pela competência da nota. Sem competência, devolve o texto
 * como está (o formulário barra a emissão antes de chegar aqui).
 */
export function renderizarDescricao(texto: string, competencia: Competencia | null | undefined): string {
  if (!competencia) return texto
  return texto.replace(RE_VARIAVEL, (_, nome: string) => {
    if (nome === 'MES_COMPETENCIA') return MESES_PT[competencia.mes - 1]
    if (nome === 'ANO_COMPETENCIA') return String(competencia.ano)
    return formatarCompetencia(competencia)
  })
}

/** Regex do nome do mês sem depender de acento/caixa ("março", "MARCO"). */
function padraoMes(mes: number): string {
  return MESES_PT[mes - 1]
    .toLowerCase()
    .replace(/ç/g, '[cç]')
}

export interface SugestaoModelo {
  antes: string
  depois: string
}

/**
 * Se a descrição copiada cita a competência DA NOTA DE ORIGEM ("OUTUBRO DE
 * 2026", "outubro/2026", "10/2026"), sugere a versão com variáveis. Só aquela
 * competência — "setembro de 2026" numa nota de outubro fica como está (pode
 * ser referência a outro período). Nada a trocar = null.
 */
export function sugerirModeloComVariaveis(texto: string | undefined | null, origem: Competencia | null | undefined): SugestaoModelo | null {
  const antes = String(texto ?? '')
  if (!antes.trim() || !origem) return null
  const ano = String(origem.ano)
  const mes2 = String(origem.mes).padStart(2, '0')
  const mesNum = origem.mes < 10 ? `0?${origem.mes}` : mes2

  let depois = antes
  // "OUTUBRO DE 2026", "Outubro/2026", "outubro - 2026", "OUTUBRO 2026"
  depois = depois.replace(
    new RegExp(`(?<![\\p{L}])(${padraoMes(origem.mes)})(\\s+de\\s+|\\s*[/-]\\s*|\\s+)(${ano})(?!\\d)`, 'giu'),
    (_m, _mes, sep: string) => `{{MES_COMPETENCIA}}${sep}{{ANO_COMPETENCIA}}`,
  )
  // "10/2026", "10-2026", "10.2026" — mas não o fim de uma data "05/10/2026".
  depois = depois.replace(
    new RegExp(`(?<![\\d/.-])${mesNum}[/.-]${ano}(?!\\d)`, 'g'),
    '{{MES_ANO_COMPETENCIA}}',
  )
  return depois === antes ? null : { antes, depois }
}

// ─── Cópia de nota / modelo → formulário ────────────────────────────────────

/** Campos do formulário de emissão que a cópia preenche (mesmos nomes do form). */
export interface ValoresCopiados {
  tomadorNome?: string
  /** Só dígitos — o formulário aplica a máscara. */
  tomadorCpfCnpj?: string
  tomadorEmail?: string
  tomadorCep?: string
  tomadorLogradouro?: string
  tomadorNumero?: string
  tomadorComplemento?: string
  tomadorBairro?: string
  tomadorMunicipio?: string
  tomadorMunicipioIbge?: string
  tomadorUf?: string
  descricaoServico?: string
  codigoServico?: string
  itemListaServico?: string
  codigoTributacaoNacional?: string
  codigoNbs?: string
  municipioPrestacaoIbge?: string
  valorServico?: number
  aliquota?: number
  issRetido?: boolean
  informacoesComplementares?: string
}

export interface EnderecoTomadorGravado {
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  municipio?: string | null
  municipioIbge?: string | null
  uf?: string | null
}

/** O que a cópia lê de um documento de nfse_emitidas. */
export interface NotaEmitidaParaCopia {
  id: string
  numeroNfse?: string | null
  dataEmissao?: unknown
  competenciaId?: string | null
  /** AAAA-MM-DD — gravado desde a emissão com competência explícita. */
  dataCompetencia?: string | null
  tomadorNome?: string | null
  tomadorCpfCnpj?: string | null
  tomadorEmail?: string | null
  tomadorEndereco?: EnderecoTomadorGravado | null
  descricaoServico?: string | null
  descricaoServicoModelo?: string | null
  codigoServico?: string | null
  itemListaServico?: string | null
  codigoTributacaoNacional?: string | null
  codigoNbs?: string | null
  municipioPrestacaoIbge?: string | null
  valorServico?: number | null
  aliquota?: number | null
  issRetido?: boolean | null
  informacoesComplementares?: string | null
  xmlNfse?: string | null
  status?: string | null
}

/** Dados que o XML oficial da NFS-e (raiz <NFSe>) traz e a cópia aproveita. */
export interface DadosXmlNfse {
  numeroNfse?: string
  competencia?: Competencia
  tomadorCpfCnpj?: string
  tomadorNome?: string
  tomadorEmail?: string
  tomadorCep?: string
  tomadorLogradouro?: string
  tomadorNumero?: string
  tomadorComplemento?: string
  tomadorBairro?: string
  tomadorMunicipioIbge?: string
  codigoTributacaoNacional?: string
  codigoNbs?: string
  descricaoServico?: string
  municipioPrestacaoIbge?: string
  municipioPrestacaoNome?: string
  informacoesComplementares?: string
  valorServico?: number
  aliquota?: number
  issRetido?: boolean
}

function filho(no: Element | undefined | null, nome: string): Element | undefined {
  if (!no) return undefined
  for (let i = 0; i < no.childNodes.length; i++) {
    const n = no.childNodes[i]
    if (n.nodeType === 1 && (n as Element).localName === nome) return n as Element
  }
  return undefined
}

function caminho(no: Element | undefined | null, rota: string): Element | undefined {
  let atual: Element | undefined = no ?? undefined
  for (const parte of rota.split('/')) {
    atual = filho(atual, parte)
    if (!atual) return undefined
  }
  return atual
}

function texto(no: Element | undefined | null, rota: string): string | undefined {
  const v = caminho(no, rota)?.textContent?.trim()
  return v ? v : undefined
}

function numero(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Lê o XML oficial da NFS-e Nacional. `parse` é injetável (no navegador e no
 * jsdom é o DOMParser global). XML vazio, malformado ou de outro padrão = null
 * — a cópia segue só com os campos gravados.
 */
export function extrairDadosXmlNfse(
  xml: string | undefined | null,
  parse: (xml: string) => Document = (x) => new DOMParser().parseFromString(x, 'text/xml'),
): DadosXmlNfse | null {
  if (!xml || typeof xml !== 'string') return null
  let doc: Document
  try {
    doc = parse(xml)
  } catch {
    return null
  }
  const raiz = doc?.documentElement
  if (!raiz || raiz.localName !== 'NFSe' || doc.getElementsByTagName('parsererror').length > 0) return null
  const inf = filho(raiz, 'infNFSe')
  const infDps = caminho(inf, 'DPS/infDPS')
  if (!inf || !infDps) return null

  const toma = filho(infDps, 'toma')
  const end = filho(toma, 'end')
  const endNac = filho(end, 'endNac')
  const serv = filho(infDps, 'serv')
  const valores = filho(infDps, 'valores')
  const tribMun = caminho(valores, 'trib/tribMun')
  const tpRet = texto(tribMun, 'tpRetISSQN')
  const dCompet = texto(infDps, 'dCompet')

  return {
    numeroNfse: texto(inf, 'nNFSe'),
    competencia: lerCompetencia(dCompet) ?? undefined,
    tomadorCpfCnpj: texto(toma, 'CNPJ') ?? texto(toma, 'CPF'),
    tomadorNome: texto(toma, 'xNome'),
    tomadorEmail: texto(toma, 'email'),
    tomadorCep: texto(endNac, 'CEP'),
    tomadorLogradouro: texto(end, 'xLgr'),
    tomadorNumero: texto(end, 'nro'),
    tomadorComplemento: texto(end, 'xCpl'),
    tomadorBairro: texto(end, 'xBairro'),
    tomadorMunicipioIbge: texto(endNac, 'cMun'),
    codigoTributacaoNacional: texto(serv, 'cServ/cTribNac'),
    codigoNbs: texto(serv, 'cServ/cNBS'),
    descricaoServico: texto(serv, 'cServ/xDescServ'),
    municipioPrestacaoIbge: texto(serv, 'locPrest/cLocPrestacao'),
    municipioPrestacaoNome: texto(inf, 'xLocPrestacao'),
    informacoesComplementares: texto(serv, 'infoCompl/xInfComp'),
    valorServico: numero(texto(valores, 'vServPrest/vServ')),
    // pAliq só vai na DPS em casos específicos; a alíquota aplicada fica na NFS-e.
    aliquota: numero(texto(tribMun, 'pAliq') ?? texto(inf, 'valores/pAliqAplic')),
    issRetido: tpRet ? tpRet !== '1' : undefined,
  }
}

/** cTribNac "010201" → item LC 116 "1.02" (formato do Lc116Picker). */
export function itemLc116DoCodigoNacional(cTribNac: string | undefined | null): string | undefined {
  const d = String(cTribNac ?? '').replace(/\D/g, '')
  if (d.length !== 6) return undefined
  const item = Number(d.slice(0, 2))
  if (!item) return undefined
  return `${item}.${d.slice(2, 4)}`
}

/** Item LC 116 "1.02" → cTribNac derivado "010201" (mesma regra do backend, desdobro 01). */
export function codigoNacionalDerivado(itemLista: string | undefined | null): string | undefined {
  const partes = String(itemLista ?? '').trim().split(/[.\-\s]+/).filter(Boolean)
  if (partes.length < 2 || !partes.every((p) => /^\d{1,2}$/.test(p))) return undefined
  const [it, sub, desd = '01'] = partes
  return it.padStart(2, '0') + sub.padStart(2, '0') + desd.padStart(2, '0')
}

/** "115011000" → "1.1501.10.00" (forma da tabela oficial). Outros formatos ficam como estão. */
export function formatarNbs(valor: string | undefined | null): string {
  const bruto = String(valor ?? '').trim()
  const d = bruto.replace(/\D/g, '')
  if (d.length !== 9) return bruto
  return `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7, 9)}`
}

/** NBS vazio ou com 9 dígitos (pontuação livre). */
export function nbsValido(valor: string | undefined | null): boolean {
  const bruto = String(valor ?? '').trim()
  if (!bruto) return true
  return /^[\d.\s-]+$/.test(bruto) && bruto.replace(/\D/g, '').length === 9
}

function semVazio<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as T
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export interface ResultadoCopia {
  valores: ValoresCopiados
  /** Competência da nota de origem (para a sugestão de variáveis). */
  competenciaOrigem: Competencia | null
  numeroNfse: string | null
}

/**
 * NFS-e emitida → valores do formulário. Campos gravados têm prioridade; o XML
 * oficial completa o que faltar (notas emitidas antes de os campos existirem).
 * NÃO copia número, data, competência nem valores calculados (ISS, líquido).
 * Se a nota foi emitida a partir de uma descrição com variáveis, volta a
 * descrição-modelo — não o texto do mês dela.
 */
export function valoresDaNotaEmitida(nota: NotaEmitidaParaCopia, xml?: DadosXmlNfse | null): ResultadoCopia {
  const x = xml ?? {}
  const end = nota.tomadorEndereco ?? {}
  const cTribNacGravado = str(nota.codigoTributacaoNacional)
  const itemLista = str(nota.itemListaServico) ?? itemLc116DoCodigoNacional(x.codigoTributacaoNacional)
  // Override só quando o código da nota não é o que o item LC 116 já deriva —
  // assim trocar o item no formulário continua mudando o cTribNac.
  const cTribNacXml = x.codigoTributacaoNacional
  const cTribNac = cTribNacGravado
    ?? (cTribNacXml && cTribNacXml !== codigoNacionalDerivado(itemLista) ? cTribNacXml : undefined)

  const valores = semVazio<ValoresCopiados>({
    tomadorNome: str(nota.tomadorNome) ?? x.tomadorNome,
    tomadorCpfCnpj: (str(nota.tomadorCpfCnpj) ?? x.tomadorCpfCnpj)?.replace(/\D/g, ''),
    tomadorEmail: str(nota.tomadorEmail) ?? x.tomadorEmail,
    tomadorCep: (str(end.cep) ?? x.tomadorCep)?.replace(/\D/g, ''),
    tomadorLogradouro: str(end.logradouro) ?? x.tomadorLogradouro,
    tomadorNumero: str(end.numero) ?? x.tomadorNumero,
    tomadorComplemento: str(end.complemento) ?? x.tomadorComplemento,
    tomadorBairro: str(end.bairro) ?? x.tomadorBairro,
    tomadorMunicipio: str(end.municipio),
    tomadorMunicipioIbge: str(end.municipioIbge) ?? x.tomadorMunicipioIbge,
    tomadorUf: str(end.uf),
    descricaoServico: str(nota.descricaoServicoModelo) ?? str(nota.descricaoServico) ?? x.descricaoServico,
    codigoServico: str(nota.codigoServico),
    itemListaServico: itemLista,
    codigoTributacaoNacional: cTribNac,
    codigoNbs: str(nota.codigoNbs) ?? (x.codigoNbs ? formatarNbs(x.codigoNbs) : undefined),
    municipioPrestacaoIbge: str(nota.municipioPrestacaoIbge) ?? x.municipioPrestacaoIbge,
    valorServico: num(nota.valorServico) ?? x.valorServico,
    aliquota: num(nota.aliquota) ?? x.aliquota,
    issRetido: typeof nota.issRetido === 'boolean' ? nota.issRetido : x.issRetido,
    informacoesComplementares: str(nota.informacoesComplementares) ?? x.informacoesComplementares,
  })

  return {
    valores,
    competenciaOrigem: lerCompetencia(nota.dataCompetencia) ?? x.competencia ?? null,
    numeroNfse: str(nota.numeroNfse) ?? x.numeroNfse ?? null,
  }
}

// ─── Modelo padrão do cliente (clientes_fiscal.modeloNfse) ──────────────────

/**
 * Gravado em clientes_fiscal.modeloNfse pelo botão "Salvar como modelo padrão".
 * Campo declarativo: firestore.rules deixa o perfil fiscal escrever (não está
 * em camposFiscalDoServidor()). Nada de `undefined` aqui dentro — o Firestore
 * recusa undefined em mapa aninhado; ausente é null.
 */
export interface ModeloNfse {
  tomador: {
    nome: string | null
    cpfCnpj: string | null
    email: string | null
    endereco: EnderecoTomadorGravado | null
  }
  /** Pode conter {{MES_COMPETENCIA}} etc. */
  descricaoServico: string | null
  codigoServico: string | null
  itemListaServico: string | null
  codigoTributacaoNacional: string | null
  codigoNbs: string | null
  municipioPrestacaoIbge: string | null
  valorServico: number | null
  aliquota: number | null
  issRetido: boolean
  informacoesComplementares: string | null
  /** ISO 8601. */
  salvoEm: string
}

function nulo(v: string | undefined | null): string | null {
  const t = String(v ?? '').trim()
  return t ? t : null
}

/** Valores do formulário → modelo a gravar. */
export function modeloDoFormulario(v: ValoresCopiados, agora: Date): ModeloNfse {
  const endereco = semVazio<EnderecoTomadorGravado>({
    cep: nulo(v.tomadorCep?.replace(/\D/g, '')),
    logradouro: nulo(v.tomadorLogradouro),
    numero: nulo(v.tomadorNumero),
    complemento: nulo(v.tomadorComplemento),
    bairro: nulo(v.tomadorBairro),
    municipio: nulo(v.tomadorMunicipio),
    municipioIbge: nulo(v.tomadorMunicipioIbge?.replace(/\D/g, '')),
    uf: nulo(v.tomadorUf),
  })
  return {
    tomador: {
      nome: nulo(v.tomadorNome),
      cpfCnpj: nulo(v.tomadorCpfCnpj?.replace(/\D/g, '')),
      email: nulo(v.tomadorEmail),
      endereco: Object.keys(endereco).length > 0 ? endereco : null,
    },
    descricaoServico: nulo(v.descricaoServico),
    codigoServico: nulo(v.codigoServico),
    itemListaServico: nulo(v.itemListaServico),
    codigoTributacaoNacional: nulo(v.codigoTributacaoNacional?.replace(/\D/g, '')),
    codigoNbs: nulo(v.codigoNbs),
    municipioPrestacaoIbge: nulo(v.municipioPrestacaoIbge?.replace(/\D/g, '')),
    valorServico: num(v.valorServico) ?? null,
    aliquota: num(v.aliquota) ?? null,
    issRetido: v.issRetido === true,
    informacoesComplementares: nulo(v.informacoesComplementares),
    salvoEm: agora.toISOString(),
  }
}

/** Modelo gravado → valores do formulário. Lê defensivamente (o doc vem do Firestore). */
export function valoresDoModelo(modelo: unknown): ValoresCopiados | null {
  if (!modelo || typeof modelo !== 'object') return null
  const m = modelo as Partial<ModeloNfse>
  const t = (m.tomador ?? {}) as Partial<ModeloNfse['tomador']>
  const e = (t.endereco ?? {}) as EnderecoTomadorGravado
  const valores = semVazio<ValoresCopiados>({
    tomadorNome: str(t.nome),
    tomadorCpfCnpj: str(t.cpfCnpj)?.replace(/\D/g, ''),
    tomadorEmail: str(t.email),
    tomadorCep: str(e.cep)?.replace(/\D/g, ''),
    tomadorLogradouro: str(e.logradouro),
    tomadorNumero: str(e.numero),
    tomadorComplemento: str(e.complemento),
    tomadorBairro: str(e.bairro),
    tomadorMunicipio: str(e.municipio),
    tomadorMunicipioIbge: str(e.municipioIbge),
    tomadorUf: str(e.uf),
    descricaoServico: str(m.descricaoServico),
    codigoServico: str(m.codigoServico),
    itemListaServico: str(m.itemListaServico),
    codigoTributacaoNacional: str(m.codigoTributacaoNacional),
    codigoNbs: str(m.codigoNbs),
    municipioPrestacaoIbge: str(m.municipioPrestacaoIbge),
    valorServico: num(m.valorServico),
    aliquota: num(m.aliquota),
    issRetido: typeof m.issRetido === 'boolean' ? m.issRetido : undefined,
    informacoesComplementares: str(m.informacoesComplementares),
  })
  return Object.keys(valores).length > 0 ? valores : null
}

// ─── Histórico ──────────────────────────────────────────────────────────────

function milis(v: unknown): number {
  if (!v) return 0
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'object') {
    const o = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number }
    if (typeof o.toMillis === 'function') return o.toMillis()
    if (typeof o.toDate === 'function') return o.toDate().getTime()
    if (typeof o.seconds === 'number') return o.seconds * 1000
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

/**
 * Notas do cliente que servem de base: emitidas (não cancelada/rejeitada),
 * da mais recente para a mais antiga, no máximo `limite`. Ordena no cliente
 * para não depender de índice composto além do filtro por clienteId.
 */
export function notasParaCopia<T extends NotaEmitidaParaCopia>(notas: T[], limite = 20): T[] {
  return notas
    .filter((n) => !n.status || n.status === 'emitida' || n.status === 'substituida')
    .sort((a, b) => milis(b.dataEmissao) - milis(a.dataEmissao))
    .slice(0, limite)
}

export function dataEmissaoDe(nota: Pick<NotaEmitidaParaCopia, 'dataEmissao'>): Date | null {
  const t = milis(nota.dataEmissao)
  return t > 0 ? new Date(t) : null
}
