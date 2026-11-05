/**
 * Montagem da DPS e do pedido de registro de evento (cancelamento) no leiaute
 * nacional da NFS-e — funções PURAS: recebem dados, devolvem XML (sem assinatura).
 *
 * Fonte do leiaute: esquemas XSD da PRODUÇÃO RESTRITA publicados em
 * https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita
 * (esquemas_prod_restrita_20261020.zip, versão 1.01 — cópia em
 * scripts/poc-nfse-nacional/schemas/). A ordem dos elementos segue o XSD ao pé
 * da letra: fora de ordem = E1235.
 *
 * AMBIENTE: `opcoes.ambiente` decide o tpAmb ('homologacao' → 2, 'producao' → 1).
 * O padrão é 'homologacao' — quem não passa nada (o PoC) nunca gera tpAmb = 1.
 *
 * Sem imports relativos: o arquivo roda direto no Node (type stripping) a partir
 * do cli.mjs, é compilado nas Functions e importado pelos testes do vitest.
 */

export const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse'
export const VERSAO_LEIAUTE = '1.01'
/** 2 = Homologação (produção restrita). Padrão quando o ambiente não é informado. */
export const TP_AMB_PRODUCAO_RESTRITA = '2'
/** 1 = Produção. Só sai quando o chamador pede explicitamente ambiente 'producao'. */
export const TP_AMB_PRODUCAO = '1'
/** TSVerAplic: 1 a 20 caracteres. */
export const VER_APLIC_PADRAO = 'TTRD-JPFiscal-1.0'

export type AmbienteDps = 'homologacao' | 'producao'

/** tpAmb do ambiente. Valor desconhecido = erro (falha fechado, nunca vira produção). */
export function tpAmbDoAmbiente(ambiente: AmbienteDps | undefined): '1' | '2' {
  if (ambiente === undefined || ambiente === 'homologacao') return TP_AMB_PRODUCAO_RESTRITA
  if (ambiente === 'producao') return TP_AMB_PRODUCAO
  throw new Error(`Ambiente desconhecido para a DPS: ${String(ambiente)}`)
}

export const CODIGO_EVENTO_CANCELAMENTO = '101101'
export const XDESC_CANCELAMENTO = 'Cancelamento de NFS-e'

// ─── Tipos do JSON de entrada (`emitir --dados nota.json`) ──────────────────

export interface EnderecoNacional {
  cep: string            // 8 dígitos
  municipioIbge: string  // 7 dígitos
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
}

export interface DadosPrestador {
  /** CNPJ (14) — dígitos; o leiaute 1.01 também aceita CNPJ alfanumérico. */
  cnpj: string
  inscricaoMunicipal?: string
  /** IBGE do município emissor (vira cLocEmi e entra no Id da DPS). */
  municipioIbge: string
  regime: {
    /** 1 = Não optante; 2 = MEI; 3 = ME/EPP optante do Simples Nacional. */
    opSimpNac: 1 | 2 | 3
    /** Só para opSimpNac = 3. 1 = federais e municipal pelo SN; 2 = federais pelo SN e ISSQN fora; 3 = tudo fora do SN. */
    regApTribSN?: 1 | 2 | 3
    /** 0 = nenhum; 1 = ato cooperado; 2 = estimativa; 3 = ME municipal; 4 = notário; 5 = profissional autônomo; 6 = sociedade de profissionais; 9 = outros. */
    regEspTrib: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9
  }
}

export interface DadosTomador {
  cpfCnpj: string
  razaoSocial: string
  inscricaoMunicipal?: string
  email?: string
  fone?: string
  endereco?: EnderecoNacional
}

export interface DadosServico {
  /** Código de tributação nacional — 6 dígitos (item+subitem+desdobro, ex.: 171901). */
  cTribNac: string
  /** Desdobro municipal — 3 dígitos. Alguns municípios exigem (E0312), outros recusam (E0315). */
  cTribMun?: string
  /** NBS — 9 dígitos (opcional). */
  cNBS?: string
  descricao: string
  /** IBGE do local da prestação. */
  municipioPrestacao: string
  informacoesComplementares?: string
}

export type TotalTributos =
  | { pTotTribSN: number }                                   // ME/EPP do Simples
  | { indTotTrib: 0 }                                        // não informar (MEI / não optante)
  | { vTotTrib: { federal: number; estadual: number; municipal: number } }
  | { pTotTrib: { federal: number; estadual: number; municipal: number } }

export interface DadosValores {
  valorServico: number
  descontoIncondicionado?: number
  descontoCondicionado?: number
  /** 1 = Operação tributável; 2 = Imunidade; 3 = Exportação; 4 = Não incidência. */
  tribISSQN: 1 | 2 | 3 | 4
  /** 1 = Não retido; 2 = Retido pelo tomador; 3 = Retido pelo intermediário. */
  tpRetISSQN: 1 | 2 | 3
  /** Alíquota do ISSQN em % (ex.: 2.5). Regras do município decidem se vai ou não. */
  aliquotaIss?: number
  pisCofins?: {
    cst: string
    baseCalculo?: number
    aliquotaPis?: number
    aliquotaCofins?: number
    valorPis?: number
    valorCofins?: number
    tpRetPisCofins?: string
  }
  retencaoCp?: number
  retencaoIrrf?: number
  retencaoCsll?: number
  totTrib: TotalTributos
}

/**
 * Grupo IBSCBS (reforma tributária, NT 004/007/009). OPCIONAL no XSD
 * (minOccurs=0). Só a classificação da operação: base/alíquotas/valores a
 * Sefin calcula. Optantes do Simples estão dispensados do destaque em 2026
 * (confirmar caso a caso antes de preencher).
 */
export interface DadosIbsCbs {
  /** 0 = não; 1 = uso ou consumo pessoal. */
  indFinal?: 0 | 1
  /** Código indicador da operação (6 dígitos, Anexo VII/AnexoC). */
  cIndOp: string
  /** 0 = destinatário é o próprio tomador; 1 = outro destinatário. */
  indDest: 0 | 1
  /** CST do IBS/CBS (3 dígitos). */
  cst: string
  /** Classificação tributária (6 dígitos). */
  cClassTrib: string
}

export interface DadosDps {
  serie: string
  numero: number | string
  /** AAAA-MM-DD. */
  competencia: string
}

export interface DadosNota {
  prestador: DadosPrestador
  tomador?: DadosTomador
  servico: DadosServico
  valores: DadosValores
  dps: DadosDps
  ibscbs?: DadosIbsCbs
}

export interface OpcoesMontagem {
  /** dhEmi já formatado (AAAA-MM-DDThh:mm:ss±hh:mm). Use formatarDhEmi(). */
  dhEmi: string
  verAplic?: string
  /** Padrão 'homologacao' (tpAmb = 2). */
  ambiente?: AmbienteDps
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

export function somenteDigitos(valor: string | number | undefined | null): string {
  return String(valor ?? '').replace(/\D+/g, '')
}

/** CNPJ alfanumérico (leiaute 1.01): mantém [0-9A-Z], descarta pontuação. */
export function normalizarCnpj(valor: string): string {
  return String(valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function escaparXml(texto: string): string {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Decimal com 2 casas no formato do XSD (TSDec15V2: "0", "0.50", "1500.00"). */
export function decimal2(valor: number, campo: string): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
    throw new Error(`${campo}: valor numérico inválido (${String(valor)})`)
  }
  // toFixed sobre o valor arredondado em centavos evita 2.675 → 2.67.
  return (Math.round((valor + Number.EPSILON) * 100) / 100).toFixed(2)
}

const FUSO_BRASILIA_MIN = -180 // America/Sao_Paulo sem horário de verão desde 2019

/**
 * dhEmi/dhEvento no formato do XSD (TSDateTimeUTC): AAAA-MM-DDThh:mm:ss-03:00,
 * sem milissegundos. Sefin rejeita data futura (E0008) — quem chama deve
 * passar um instante levemente recuado (ver instanteSeguroParaEmissao).
 */
export function formatarDhEmi(instante: Date): string {
  const local = new Date(instante.getTime() + FUSO_BRASILIA_MIN * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}-03:00`
  )
}

/** Data AAAA-MM-DD no fuso de Brasília. */
export function dataBrasilia(instante: Date): string {
  return formatarDhEmi(instante).slice(0, 10)
}

/**
 * Recua alguns segundos para não empatar com o relógio da Sefin (E0008:
 * "data de emissão posterior à data de processamento"), sem cruzar a
 * meia-noite de Brasília (trocaria a competência).
 */
export function instanteSeguroParaEmissao(agora: Date, segundos = 10): Date {
  const recuado = new Date(agora.getTime() - segundos * 1000)
  return dataBrasilia(recuado) === dataBrasilia(agora) ? recuado : agora
}

/**
 * Id da DPS (TSIdDPS, 45 posições):
 * "DPS" + IBGE emissor (7) + tipo de inscrição (1: 1=CPF, 2=CNPJ)
 * + inscrição federal (14, CPF com zeros à esquerda) + série (5) + nDPS (15).
 * É o mesmo identificador de GET/HEAD /dps/{id}, sem o prefixo "DPS".
 */
export function montarIdDps(params: {
  municipioIbge: string
  cpfCnpj: string
  serie: string | number
  numero: string | number
}): string {
  const ibge = somenteDigitos(params.municipioIbge)
  if (ibge.length !== 7) throw new Error('Id da DPS: código IBGE do município emissor deve ter 7 dígitos')
  const doc = normalizarCnpj(params.cpfCnpj)
  let tpInsc: '1' | '2'
  if (doc.length === 14) tpInsc = '2'
  else if (doc.length === 11 && /^\d+$/.test(doc)) tpInsc = '1'
  else throw new Error('Id da DPS: inscrição federal deve ser CNPJ (14) ou CPF (11)')
  const serie = somenteDigitos(params.serie)
  const numero = somenteDigitos(params.numero)
  if (!serie || serie.length > 5) throw new Error('Id da DPS: série deve ter de 1 a 5 dígitos')
  if (!numero || numero.length > 15 || numero.startsWith('0')) {
    throw new Error('Id da DPS: número da DPS deve ter de 1 a 15 dígitos, sem zero à esquerda')
  }
  return `DPS${ibge}${tpInsc}${doc.padStart(14, '0')}${serie.padStart(5, '0')}${numero.padStart(15, '0')}`
}

/** Id do pedido de evento (TSIdPedRegEvt, 59): "PRE" + chave (50) + código do evento (6). */
export function montarIdPedidoEvento(chaveAcesso: string, codigoEvento: string): string {
  const chave = normalizarCnpj(chaveAcesso)
  if (!/^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/.test(chave)) {
    throw new Error('Chave de acesso inválida: esperadas 50 posições no padrão do leiaute nacional')
  }
  if (!/^\d{6}$/.test(codigoEvento)) throw new Error('Código do evento deve ter 6 dígitos')
  return `PRE${chave}${codigoEvento}`
}

// ─── Validação prévia (erros que dá para pegar sem gastar uma chamada) ──────

export function validarDadosNota(d: DadosNota): string[] {
  const erros: string[] = []
  const p = d?.prestador
  if (!p) return ['prestador: obrigatório']
  const cnpj = normalizarCnpj(p.cnpj ?? '')
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) erros.push('prestador.cnpj: CNPJ com 14 posições')
  if (!/^\d{7}$/.test(somenteDigitos(p.municipioIbge))) erros.push('prestador.municipioIbge: IBGE com 7 dígitos')
  if (p.inscricaoMunicipal !== undefined && !somenteDigitos(p.inscricaoMunicipal)) {
    erros.push('prestador.inscricaoMunicipal: informe dígitos ou remova o campo')
  }
  const r = p.regime
  if (!r || ![1, 2, 3].includes(r.opSimpNac)) erros.push('prestador.regime.opSimpNac: 1, 2 ou 3')
  if (r && r.opSimpNac !== 3 && r.regApTribSN !== undefined) {
    erros.push('prestador.regime.regApTribSN: só para ME/EPP optante (opSimpNac = 3) — E0162')
  }
  if (r && ![0, 1, 2, 3, 4, 5, 6, 9].includes(r.regEspTrib)) erros.push('prestador.regime.regEspTrib: valor fora do domínio')

  const t = d.tomador
  if (t) {
    const doc = normalizarCnpj(t.cpfCnpj ?? '')
    if (!(doc.length === 14 || (doc.length === 11 && /^\d+$/.test(doc)))) erros.push('tomador.cpfCnpj: CPF (11) ou CNPJ (14)')
    if (!t.razaoSocial?.trim()) erros.push('tomador.razaoSocial: obrigatório quando há tomador identificado')
    if (t.endereco) {
      const e = t.endereco
      if (!/^\d{8}$/.test(somenteDigitos(e.cep))) erros.push('tomador.endereco.cep: 8 dígitos')
      if (!/^\d{7}$/.test(somenteDigitos(e.municipioIbge))) erros.push('tomador.endereco.municipioIbge: 7 dígitos')
      if (!e.logradouro?.trim() || !e.numero?.trim() || !e.bairro?.trim()) {
        erros.push('tomador.endereco: logradouro, numero e bairro obrigatórios (endereço parcial = E1235)')
      }
    }
  }

  const s = d.servico
  if (!s) erros.push('servico: obrigatório')
  else {
    if (!/^\d{6}$/.test(somenteDigitos(s.cTribNac)) || somenteDigitos(s.cTribNac) !== s.cTribNac) {
      erros.push('servico.cTribNac: 6 dígitos, sem pontos (ex.: 171901)')
    }
    if (s.cTribMun !== undefined && !/^\d{3}$/.test(s.cTribMun)) erros.push('servico.cTribMun: 3 dígitos')
    if (s.cNBS !== undefined && !/^\d{9}$/.test(s.cNBS)) erros.push('servico.cNBS: 9 dígitos')
    if (!s.descricao?.trim() || s.descricao.length > 2000) erros.push('servico.descricao: 1 a 2000 caracteres')
    if (!/^\d{7}$/.test(somenteDigitos(s.municipioPrestacao))) erros.push('servico.municipioPrestacao: IBGE com 7 dígitos')
  }

  const v = d.valores
  if (!v) erros.push('valores: obrigatório')
  else {
    if (!(typeof v.valorServico === 'number' && v.valorServico > 0)) erros.push('valores.valorServico: número > 0')
    if (![1, 2, 3, 4].includes(v.tribISSQN)) erros.push('valores.tribISSQN: 1, 2, 3 ou 4')
    if (![1, 2, 3].includes(v.tpRetISSQN)) erros.push('valores.tpRetISSQN: 1, 2 ou 3')
    if (v.aliquotaIss !== undefined && !(v.aliquotaIss >= 0 && v.aliquotaIss < 10)) {
      erros.push('valores.aliquotaIss: percentual entre 0 e 9.99')
    }
    if (!v.totTrib) erros.push('valores.totTrib: obrigatório (totTrib é sempre exigido — E1235)')
    else if (r?.opSimpNac === 3 && !('pTotTribSN' in v.totTrib)) {
      erros.push('valores.totTrib: ME/EPP do Simples usa { "pTotTribSN": n } — E0712')
    }
    if (r?.opSimpNac === 2 && v.pisCofins) erros.push('valores.pisCofins: MEI não informa tributos federais — E0676')
  }

  const dps = d.dps
  if (!dps) erros.push('dps: obrigatório (serie, numero, competencia)')
  else {
    if (!/^([0-9]{1,4}|[0-8][0-9]{4})$/.test(String(dps.serie))) erros.push('dps.serie: 1 a 5 dígitos (padrão do XSD)')
    if (!/^[1-9][0-9]{0,14}$/.test(String(dps.numero))) erros.push('dps.numero: 1 a 15 dígitos, sem zero à esquerda')
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dps.competencia ?? '')) erros.push('dps.competencia: AAAA-MM-DD')
  }

  if (d.ibscbs) {
    const g = d.ibscbs
    if (!/^\d{6}$/.test(g.cIndOp ?? '')) erros.push('ibscbs.cIndOp: 6 dígitos')
    if (!/^\d{3}$/.test(g.cst ?? '')) erros.push('ibscbs.cst: 3 dígitos')
    if (!/^\d{6}$/.test(g.cClassTrib ?? '')) erros.push('ibscbs.cClassTrib: 6 dígitos')
    if (![0, 1].includes(g.indDest)) erros.push('ibscbs.indDest: 0 ou 1')
  }
  return erros
}

// ─── Montagem ───────────────────────────────────────────────────────────────

type No = string | false | null | undefined

function el(nome: string, conteudo: string | number): string {
  return `<${nome}>${escaparXml(String(conteudo))}</${nome}>`
}

/** Grupo: some se nenhum filho foi emitido (grupo vazio = falha de schema). */
function grupo(nome: string, filhos: No[]): string {
  const corpo = filhos.filter(Boolean).join('')
  return corpo ? `<${nome}>${corpo}</${nome}>` : ''
}

function opt(nome: string, valor: string | number | undefined | null): No {
  if (valor === undefined || valor === null || valor === '') return null
  return el(nome, valor)
}

function optDec(nome: string, valor: number | undefined): No {
  return valor === undefined ? null : el(nome, decimal2(valor, nome))
}

function identificacao(doc: string): string {
  const d = normalizarCnpj(doc)
  return d.length === 14 ? el('CNPJ', d) : el('CPF', d)
}

function enderecoNacional(e: EnderecoNacional): string {
  return grupo('end', [
    grupo('endNac', [el('cMun', somenteDigitos(e.municipioIbge)), el('CEP', somenteDigitos(e.cep))]),
    el('xLgr', e.logradouro.trim()),
    el('nro', e.numero.trim()),
    opt('xCpl', e.complemento?.trim()),
    el('xBairro', e.bairro.trim()),
  ])
}

function totalTributos(t: TotalTributos): string {
  if ('pTotTribSN' in t) return grupo('totTrib', [el('pTotTribSN', decimal2(t.pTotTribSN, 'pTotTribSN'))])
  if ('indTotTrib' in t) return grupo('totTrib', [el('indTotTrib', '0')])
  if ('vTotTrib' in t) {
    return grupo('totTrib', [grupo('vTotTrib', [
      el('vTotTribFed', decimal2(t.vTotTrib.federal, 'vTotTribFed')),
      el('vTotTribEst', decimal2(t.vTotTrib.estadual, 'vTotTribEst')),
      el('vTotTribMun', decimal2(t.vTotTrib.municipal, 'vTotTribMun')),
    ])])
  }
  return grupo('totTrib', [grupo('pTotTrib', [
    el('pTotTribFed', decimal2(t.pTotTrib.federal, 'pTotTribFed')),
    el('pTotTribEst', decimal2(t.pTotTrib.estadual, 'pTotTribEst')),
    el('pTotTribMun', decimal2(t.pTotTrib.municipal, 'pTotTribMun')),
  ])])
}

/**
 * Monta o XML da DPS (sem assinatura), com declaração UTF-8 (sem ela, E1229),
 * namespace padrão sem prefixo (prefixo = E1228) e sem espaços entre tags.
 */
export function montarDpsXml(d: DadosNota, opcoes: OpcoesMontagem): { xml: string; id: string } {
  const erros = validarDadosNota(d)
  if (erros.length) throw new Error('Dados da nota inválidos:\n  - ' + erros.join('\n  - '))
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:00$/.test(opcoes.dhEmi)) {
    throw new Error('dhEmi fora do formato AAAA-MM-DDThh:mm:ss±hh:00')
  }
  if (d.dps.competencia > opcoes.dhEmi.slice(0, 10)) {
    throw new Error('dps.competencia não pode ser posterior à data de emissão')
  }
  const verAplic = (opcoes.verAplic ?? VER_APLIC_PADRAO).slice(0, 20)
  const { prestador: p, tomador: t, servico: s, valores: v } = d
  const id = montarIdDps({
    municipioIbge: p.municipioIbge,
    cpfCnpj: p.cnpj,
    serie: d.dps.serie,
    numero: d.dps.numero,
  })

  // Prestador = emitente (tpEmit=1): sem xNome/end (E0128/E0121) — a Sefin
  // busca no cadastro. IM antes de regTrib (ordem do XSD).
  const prest = grupo('prest', [
    el('CNPJ', normalizarCnpj(p.cnpj)),
    opt('IM', somenteDigitos(p.inscricaoMunicipal)),
    grupo('regTrib', [
      el('opSimpNac', p.regime.opSimpNac),
      p.regime.opSimpNac === 3 ? opt('regApTribSN', p.regime.regApTribSN) : null,
      el('regEspTrib', p.regime.regEspTrib),
    ]),
  ])

  const toma = t
    ? grupo('toma', [
        identificacao(t.cpfCnpj),
        opt('IM', somenteDigitos(t.inscricaoMunicipal)),
        el('xNome', t.razaoSocial.trim().slice(0, 300)),
        t.endereco ? enderecoNacional(t.endereco) : null,
        opt('fone', somenteDigitos(t.fone)),
        opt('email', t.email?.trim().slice(0, 80)),
      ])
    : ''

  // Ordem de cServ difere entre os leiautes (fora de ordem = E1235):
  //  - PRODUÇÃO (v1.01-20260209): cTribNac, cTribMun, xDescServ, cNBS;
  //  - produção restrita (NT 009): cTribNac, cTribMun, cNBS, xDescServ (último).
  const producao = tpAmbDoAmbiente(opcoes.ambiente) === TP_AMB_PRODUCAO
  const serv = grupo('serv', [
    grupo('locPrest', [el('cLocPrestacao', somenteDigitos(s.municipioPrestacao))]),
    grupo('cServ', producao
      ? [
          el('cTribNac', s.cTribNac),
          opt('cTribMun', s.cTribMun),
          el('xDescServ', s.descricao.trim()),
          opt('cNBS', s.cNBS),
        ]
      : [
          el('cTribNac', s.cTribNac),
          opt('cTribMun', s.cTribMun),
          opt('cNBS', s.cNBS),
          el('xDescServ', s.descricao.trim()),
        ]),
    s.informacoesComplementares?.trim()
      ? grupo('infoCompl', [el('xInfComp', s.informacoesComplementares.trim().slice(0, 2000))])
      : null,
  ])

  const pc = v.pisCofins
  const valores = grupo('valores', [
    grupo('vServPrest', [el('vServ', decimal2(v.valorServico, 'valorServico'))]),
    grupo('vDescCondIncond', [
      optDec('vDescIncond', v.descontoIncondicionado),
      optDec('vDescCond', v.descontoCondicionado),
    ]),
    grupo('trib', [
      grupo('tribMun', [
        el('tribISSQN', v.tribISSQN),
        el('tpRetISSQN', v.tpRetISSQN),
        optDec('pAliq', v.aliquotaIss),
      ]),
      grupo('tribFed', [
        pc
          ? grupo('piscofins', [
              el('CST', pc.cst),
              optDec('vBCPisCofins', pc.baseCalculo),
              optDec('pAliqPis', pc.aliquotaPis),
              optDec('pAliqCofins', pc.aliquotaCofins),
              optDec('vPis', pc.valorPis),
              optDec('vCofins', pc.valorCofins),
              opt('tpRetPisCofins', pc.tpRetPisCofins),
            ])
          : null,
        optDec('vRetCP', v.retencaoCp),
        optDec('vRetIRRF', v.retencaoIrrf),
        optDec('vRetCSLL', v.retencaoCsll),
      ]),
      totalTributos(v.totTrib),
    ]),
  ])

  // NT 009: CST e cClassTrib ficam direto em valores/trib (gIBSCBS só para
  // crédito presumido / regular / diferimento, que este PoC não cobre).
  const g = d.ibscbs
  const ibscbs = g
    ? grupo('IBSCBS', [
        opt('indFinal', g.indFinal),
        el('cIndOp', g.cIndOp),
        el('indDest', g.indDest),
        grupo('valores', [grupo('trib', [el('CST', g.cst), el('cClassTrib', g.cClassTrib)])]),
      ])
    : ''

  const infDps =
    `<infDPS Id="${id}">` +
    el('tpAmb', tpAmbDoAmbiente(opcoes.ambiente)) +
    el('dhEmi', opcoes.dhEmi) +
    el('verAplic', verAplic) +
    el('serie', String(d.dps.serie)) +
    el('nDPS', String(d.dps.numero)) +
    el('dCompet', d.dps.competencia) +
    el('tpEmit', '1') +
    // finNFSe só existe no leiaute da NT 009, hoje em vigor apenas na produção
    // restrita. O XSD de PRODUÇÃO (v1.01-20260209) não tem o campo em infDPS e
    // recusa a DPS com E1235 — confirmado em 2026-11-05 na primeira emissão real.
    (tpAmbDoAmbiente(opcoes.ambiente) === TP_AMB_PRODUCAO_RESTRITA ? el('finNFSe', '0') : '') +
    el('cLocEmi', somenteDigitos(p.municipioIbge)) +
    prest +
    toma +
    serv +
    valores +
    ibscbs +
    '</infDPS>'

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<DPS xmlns="${NS_NFSE}" versao="${VERSAO_LEIAUTE}">${infDps}</DPS>`
  return { xml, id }
}

export interface DadosCancelamento {
  chaveAcesso: string
  /** CNPJ (14) ou CPF (11) do autor — o mesmo do certificado (E0812/E0815). */
  autorCpfCnpj: string
  /** 1 = Erro na emissão; 2 = Serviço não prestado; 9 = Outros. */
  codigoMotivo: 1 | 2 | 9
  /** 15 a 255 caracteres. */
  motivo: string
}

/** Pedido de registro do evento e101101 (cancelamento), sem assinatura. */
export function montarPedidoCancelamentoXml(
  d: DadosCancelamento,
  opcoes: { dhEvento: string; verAplic?: string; ambiente?: AmbienteDps },
): { xml: string; id: string } {
  const motivo = String(d.motivo ?? '').trim()
  if (motivo.length < 15 || motivo.length > 255) {
    throw new Error('Motivo do cancelamento deve ter de 15 a 255 caracteres')
  }
  if (![1, 2, 9].includes(d.codigoMotivo)) throw new Error('codigoMotivo: 1, 2 ou 9')
  const autor = normalizarCnpj(d.autorCpfCnpj)
  if (!(autor.length === 14 || (autor.length === 11 && /^\d+$/.test(autor)))) {
    throw new Error('Autor do evento deve ser CNPJ (14) ou CPF (11)')
  }
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:00$/.test(opcoes.dhEvento)) {
    throw new Error('dhEvento fora do formato AAAA-MM-DDThh:mm:ss±hh:00')
  }
  const chave = normalizarCnpj(d.chaveAcesso)
  const id = montarIdPedidoEvento(chave, CODIGO_EVENTO_CANCELAMENTO)
  const inf =
    `<infPedReg Id="${id}">` +
    el('tpAmb', tpAmbDoAmbiente(opcoes.ambiente)) +
    el('verAplic', (opcoes.verAplic ?? VER_APLIC_PADRAO).slice(0, 20)) +
    el('dhEvento', opcoes.dhEvento) +
    el(autor.length === 14 ? 'CNPJAutor' : 'CPFAutor', autor) +
    el('chNFSe', chave) +
    `<e${CODIGO_EVENTO_CANCELAMENTO}>` +
    el('xDesc', XDESC_CANCELAMENTO) +
    el('cMotivo', d.codigoMotivo) +
    el('xMotivo', motivo) +
    `</e${CODIGO_EVENTO_CANCELAMENTO}>` +
    '</infPedReg>'
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<pedRegEvento xmlns="${NS_NFSE}" versao="${VERSAO_LEIAUTE}">${inf}</pedRegEvento>`
  return { xml, id }
}
