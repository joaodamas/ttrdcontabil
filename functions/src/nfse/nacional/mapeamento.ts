/**
 * Mapeamento PURO: dados da plataforma (EmitirNfseInput + ConfigFiscalCliente +
 * Prestador) → DadosNota do leiaute nacional (nacional/dps.ts).
 *
 * Premissas marcadas com "PREMISSA" precisam ser confirmadas na homologação
 * (produção restrita) antes de liberar produção — ver
 * docs/RADAR-NFSE-NACIONAL-2026-11-05.md.
 */
import { IBGE_MAP, normalizarIbge } from '../types'
import type { ConfigFiscalCliente, EmitirNfseInput, Prestador, Tomador } from '../types'
import type { DadosIbsCbs, DadosNota, DadosPrestador, DadosTomador, TotalTributos } from './dps'

export class ErroMapeamentoNacional extends Error {
  readonly codigoErro: string
  constructor(codigoErro: string, mensagem: string) {
    super(mensagem)
    this.name = 'ErroMapeamentoNacional'
    this.codigoErro = codigoErro
  }
}

function digitos(v: unknown): string {
  return String(v ?? '').replace(/\D+/g, '')
}

function positivo(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

// ─── Regime ─────────────────────────────────────────────────────────────────

/**
 * regimeTributario/optanteSimples → regTrib do leiaute nacional.
 *  - MEI → opSimpNac 2 (não informa regApTribSN — E0162).
 *  - Simples Nacional (ou optanteSimples = true) → opSimpNac 3 (ME/EPP) com
 *    regApTribSN 1 = "tributos federais e municipal pelo SN".
 *    PREMISSA: a carteira não tem ME/EPP com ISS fora do SN (sublimite
 *    estourado → regApTribSN 2). Se tiver, precisa de campo próprio.
 *  - Demais (Presumido, Real, Isento) → opSimpNac 1 (não optante).
 *  - regEspTrib 0 (nenhum) para todos. PREMISSA: nenhum cliente em regime
 *    especial (sociedade de profissionais, estimativa...).
 */
export function mapearRegime(
  config: Pick<ConfigFiscalCliente, 'regimeTributario' | 'optanteSimples'>,
): DadosPrestador['regime'] {
  if (config.regimeTributario === 'mei') return { opSimpNac: 2, regEspTrib: 0 }
  if (config.regimeTributario === 'simples_nacional' || config.optanteSimples === true) {
    return { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 }
  }
  return { opSimpNac: 1, regEspTrib: 0 }
}

// ─── Código de tributação nacional ──────────────────────────────────────────

/**
 * cTribNac (6 dígitos) = item LC 116 (2) + subitem (2) + desdobro nacional (2).
 *   "17.19"    → "171901"  (desdobro "01" por padrão)
 *   "1.07"     → "010701"
 *   "17.19.02" → "171902"
 *   "171901"   → "171901"
 *   "1719"     → "171901"  (4 dígitos = item + subitem)
 * `override` (config.codigoTributacaoNacional) tem precedência e precisa ter 6 dígitos.
 * PREMISSA: desdobro "01" é o correto para os serviços da carteira (a tabela
 * nacional tem subitens com mais de um desdobro — conferir no Anexo B).
 */
export function mapearCodigoTributacaoNacional(itemLista: string | undefined | null, override?: string | null): string {
  const ov = String(override ?? '').trim()
  if (ov) {
    const d = digitos(ov)
    if (d.length !== 6) {
      throw new ErroMapeamentoNacional(
        'CTRIBNAC_INVALIDO',
        `Código de tributação nacional "${ov}" inválido: são 6 dígitos (item + subitem + desdobro, ex.: 171901).`,
      )
    }
    return d
  }
  const item = String(itemLista ?? '').trim()
  if (!item) {
    throw new ErroMapeamentoNacional(
      'CTRIBNAC_AUSENTE',
      'Informe o item da lista de serviço (LC 116) ou o código de tributação nacional na configuração fiscal do cliente.',
    )
  }
  const partes = item.split(/[.\-\s]+/).filter(Boolean)
  let codigo = ''
  if (partes.length >= 2 && partes.length <= 3 && partes.every((p) => /^\d{1,2}$/.test(p))) {
    const [it, sub, desd = '01'] = partes
    codigo = it.padStart(2, '0') + sub.padStart(2, '0') + desd.padStart(2, '0')
  } else if (partes.length === 1 && /^\d+$/.test(partes[0])) {
    const d = partes[0]
    if (d.length === 6) codigo = d
    else if (d.length === 4) codigo = `${d}01`
    else if (d.length === 3) codigo = `0${d}01` // "107" = item 1, subitem 07
  }
  if (!/^\d{6}$/.test(codigo) || codigo.startsWith('00') || codigo.slice(2, 4) === '00') {
    throw new ErroMapeamentoNacional(
      'CTRIBNAC_INVALIDO',
      `Não foi possível converter o item "${item}" da LC 116 no código de tributação nacional. Informe o código de 6 dígitos (ex.: 171901) na configuração fiscal.`,
    )
  }
  return codigo
}

// ─── NBS e informações complementares ───────────────────────────────────────

/**
 * Código NBS (cNBS, TSCodNBS = 9 dígitos). Aceita a forma pontuada da tabela
 * oficial ("1.1501.10.00" → "115011000"). Vazio = não informa (opcional no XSD).
 */
export function mapearCodigoNbs(valor: string | undefined | null): string | undefined {
  const bruto = String(valor ?? '').trim()
  if (!bruto) return undefined
  const d = digitos(bruto)
  if (d.length !== 9 || !/^[\d.\s-]+$/.test(bruto)) {
    throw new ErroMapeamentoNacional(
      'NBS_INVALIDO',
      `Código NBS "${bruto}" inválido: são 9 dígitos (ex.: 1.1501.10.00 ou 115011000).`,
    )
  }
  return d
}

/** Troca de caracteres comuns fora do Latin-1 por equivalentes aceitos pelo XSD. */
const SUBSTITUICOES_LATIN1: Array<[RegExp, string]> = [
  [/[\u2013\u2014\u2212]/g, '-'],
  [/[\u2018\u2019\u201A\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u2033]/g, '"'],
  [/\u2026/g, '...'],
  [/[\u2022\u25CF\u25AA]/g, '-'],
  [/[\u00A0\u2007\u202F\t]/g, ' '],
]

/**
 * xInfComp é TSString no XSD de PRODUÇÃO: só caracteres de U+0020 a U+00FF,
 * SEM quebra de linha (diferente de xDescServ, que aceita). Dados bancários
 * costumam vir em várias linhas — as linhas viram " | ". Caracteres fora do
 * Latin-1 que não têm equivalente são descartados. Limite: 2000.
 */
export function normalizarInformacoesComplementares(texto: string | undefined | null): string | undefined {
  let t = String(texto ?? '')
  for (const [re, sub] of SUBSTITUICOES_LATIN1) t = t.replace(re, sub)
  t = t
    .split(/\r\n|\r|\n/)
    .map((linha) => linha.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean)
    .join(' | ')
    .replace(/[^\u0020-\u00FF]/g, '')
    .trim()
  if (!t) return undefined
  return t.length > 2000 ? t.slice(0, 2000).trim() : t
}

// ─── ISSQN ──────────────────────────────────────────────────────────────────

/** ISS retido → tpRetISSQN: 1 = não retido; 2 = retido pelo tomador. */
export function mapearTpRetIssqn(issRetido: boolean | undefined): 1 | 2 {
  return issRetido === true ? 2 : 1
}

/**
 * naturezaOperacao (ABRASF) → tribISSQN (1 tributável, 2 imunidade, 3
 * exportação, 4 não incidência). Só "4 — Imune" muda; isenção e exigibilidade
 * suspensa no leiaute nacional são benefício/suspensão (grupos próprios que a
 * plataforma ainda não monta) → recusa explícita em vez de emitir errado.
 */
export function mapearTribIssqn(naturezaOperacao: string | undefined): 1 | 2 {
  const n = String(naturezaOperacao ?? '1').trim() || '1'
  if (n === '1' || n === '2') return 1
  if (n === '4') return 2
  throw new ErroMapeamentoNacional(
    'NATUREZA_NAO_SUPORTADA',
    'Isenção e exigibilidade suspensa ainda não são suportadas na emissão pelo Ambiente Nacional. Ajuste a natureza da operação ou emita pelo portal.',
  )
}

// ─── Tomador ────────────────────────────────────────────────────────────────

/** Tomador: CPF (11) ou CNPJ (14) pelo tamanho; endereço só quando completo (parcial = E1235). */
export function mapearTomador(t: Tomador | undefined): DadosTomador | undefined {
  if (!t) return undefined
  const doc = digitos(t.cpfCnpj)
  if (doc.length !== 11 && doc.length !== 14) {
    throw new ErroMapeamentoNacional('TOMADOR_DOCUMENTO', 'CPF/CNPJ do tomador inválido: informe 11 (CPF) ou 14 (CNPJ) dígitos.')
  }
  const e = t.endereco
  const cep = digitos(e?.cep)
  const ibgeEnd = digitos(normalizarIbge(e?.municipioIbge))
  const enderecoCompleto = Boolean(
    e && cep.length === 8 && ibgeEnd.length === 7 && e.logradouro?.trim() && e.numero?.trim() && e.bairro?.trim(),
  )
  return {
    cpfCnpj: doc,
    razaoSocial: String(t.razaoSocial ?? '').trim(),
    email: t.email?.trim() || undefined,
    endereco: enderecoCompleto && e
      ? {
          cep,
          municipioIbge: ibgeEnd,
          logradouro: e.logradouro!.trim(),
          numero: e.numero!.trim(),
          complemento: e.complemento?.trim() || undefined,
          bairro: e.bairro!.trim(),
        }
      : undefined,
  }
}

// ─── Nota completa ──────────────────────────────────────────────────────────

export interface IdentificacaoDps {
  serie: string
  numero: string
  /** AAAA-MM-DD (data de competência). */
  competencia: string
}

export function nomeMunicipio(ibge: string, config?: Pick<ConfigFiscalCliente, 'municipioEmissor' | 'municipioIbge'>): string {
  const codigo = normalizarIbge(ibge)
  if (IBGE_MAP[codigo]) return IBGE_MAP[codigo]
  if (config?.municipioEmissor && normalizarIbge(config.municipioIbge) === codigo) return config.municipioEmissor
  return `o município ${codigo}`
}

/**
 * Monta os dados da DPS.
 *
 * Alíquota (pAliq): o XSD diz que, para município do Sistema Nacional, a
 * alíquota é parametrizada e fornecida pela Sefin — como só emitimos para
 * município conveniado, NÃO enviamos pAliq. Exceção (PREMISSA): ME/EPP do
 * Simples com ISS retido — aí a alíquota é a do Anexo do Simples do prestador,
 * que o município não conhece; enviamos a alíquota da nota/configuração.
 *
 * Total de tributos (Lei 12.741, sempre exigido): ME/EPP → pTotTribSN
 * (E0712 proíbe indTotTrib) com `aliquotaSimplesNacional` ou, na falta,
 * `aliquotaPadrao` (PREMISSA); MEI e não optante → indTotTrib 0.
 */
export function montarDadosNotaNacional(
  input: EmitirNfseInput,
  config: ConfigFiscalCliente,
  prestador: Prestador,
  dps: IdentificacaoDps,
): DadosNota {
  const servico = input.servico
  if (!servico) throw new ErroMapeamentoNacional('SERVICO_AUSENTE', 'Dados do serviço obrigatórios.')

  if (positivo(servico.valorDeducoes)) {
    throw new ErroMapeamentoNacional('DEDUCOES_NAO_SUPORTADAS', 'Deduções/reduções da base de cálculo ainda não são suportadas na emissão pelo Ambiente Nacional.')
  }
  if (positivo(servico.outrasRetencoes)) {
    throw new ErroMapeamentoNacional('RETENCAO_NAO_SUPORTADA', '"Outras retenções" não existe no leiaute nacional. Remova o valor ou detalhe a retenção (IR, CSLL, INSS).')
  }
  if (positivo(servico.valorPis) || positivo(servico.valorCofins)) {
    throw new ErroMapeamentoNacional('PISCOFINS_NAO_SUPORTADO', 'PIS/COFINS na NFS-e nacional exige o CST da operação, que a plataforma ainda não coleta. Emita sem PIS/COFINS ou pelo portal.')
  }

  const regime = mapearRegime(config)
  const ibgeEmissor = normalizarIbge(prestador.municipioIbge)
  const aliquota = servico.aliquota ?? config.aliquotaPadrao
  const tpRetISSQN = mapearTpRetIssqn(servico.issRetido)

  let totTrib: TotalTributos
  if (regime.opSimpNac === 3) {
    const pSn = config.aliquotaSimplesNacional ?? aliquota
    if (typeof pSn !== 'number' || !Number.isFinite(pSn) || pSn < 0 || pSn >= 100) {
      throw new ErroMapeamentoNacional('ALIQUOTA_SN_AUSENTE', 'Para ME/EPP do Simples, informe a alíquota efetiva do Simples Nacional (ou a alíquota padrão) na configuração fiscal.')
    }
    totTrib = { pTotTribSN: pSn }
  } else {
    totTrib = { indTotTrib: 0 }
  }

  let aliquotaIss: number | undefined
  if (regime.opSimpNac === 3 && tpRetISSQN === 2) {
    if (typeof aliquota !== 'number' || !Number.isFinite(aliquota) || aliquota <= 0 || aliquota >= 10) {
      throw new ErroMapeamentoNacional('ALIQUOTA_ISS_AUSENTE', 'ISS retido de ME/EPP do Simples exige a alíquota do ISS (entre 0 e 10%).')
    }
    aliquotaIss = aliquota
  }

  const mei = regime.opSimpNac === 2
  const ir = mei ? undefined : (positivo(servico.valorIr) ? servico.valorIr : undefined)
  const csll = mei ? undefined : (positivo(servico.valorCsll) ? servico.valorCsll : undefined)
  const inss = mei ? undefined : (positivo(servico.valorInss) ? servico.valorInss : undefined)
  const cTribMun = digitos(config.codigoTributacaoMunicipal)

  return {
    prestador: {
      cnpj: digitos(prestador.cnpj),
      inscricaoMunicipal: digitos(prestador.inscricaoMunicipal) || undefined,
      municipioIbge: ibgeEmissor,
      regime,
    },
    tomador: mapearTomador(input.tomador),
    servico: {
      // Override da nota > override da config > derivado do item LC 116.
      cTribNac: mapearCodigoTributacaoNacional(
        servico.itemListaServico ?? config.itemListaServico,
        String(servico.codigoTributacaoNacional ?? '').trim() || config.codigoTributacaoNacional,
      ),
      cTribMun: cTribMun ? cTribMun.padStart(3, '0') : undefined,
      cNBS: mapearCodigoNbs(servico.codigoNbs?.trim() || config.codigoNbs),
      descricao: String(servico.discriminacao ?? '').trim(),
      municipioPrestacao: normalizarIbge(servico.municipioPrestacao) || ibgeEmissor,
      informacoesComplementares: normalizarInformacoesComplementares(servico.informacoesComplementares),
    },
    valores: {
      valorServico: servico.valorServico,
      descontoIncondicionado: positivo(servico.descontoIncondicionado) ? servico.descontoIncondicionado : undefined,
      descontoCondicionado: positivo(servico.descontoCondicionado) ? servico.descontoCondicionado : undefined,
      tribISSQN: mapearTribIssqn(config.naturezaOperacao),
      tpRetISSQN,
      aliquotaIss,
      retencaoCp: inss,
      retencaoIrrf: ir,
      retencaoCsll: csll,
      totTrib,
    },
    dps: { serie: dps.serie, numero: dps.numero, competencia: dps.competencia },
    ibscbs: mapearIbsCbs(servico, config),
  }
}

/**
 * IBS/CBS: o da nota tem precedência, campo a campo, sobre o padrão do cliente.
 * Nada preenchido = sem o grupo (Simples/MEI até 2026). Parcial = recusa, para
 * não mandar uma classificação pela metade.
 */
export function mapearIbsCbs(
  servico: Pick<NonNullable<EmitirNfseInput['servico']>, 'ibsCbsCst' | 'ibsCbsClassTrib' | 'ibsCbsIndOp'>,
  config: Pick<ConfigFiscalCliente, 'ibsCbsCst' | 'ibsCbsClassTrib' | 'ibsCbsIndOp'>,
): DadosIbsCbs | undefined {
  const cst = digitos(servico.ibsCbsCst?.trim() || config.ibsCbsCst)
  const cClassTrib = digitos(servico.ibsCbsClassTrib?.trim() || config.ibsCbsClassTrib)
  const cIndOp = digitos(servico.ibsCbsIndOp?.trim() || config.ibsCbsIndOp)
  if (!cst && !cClassTrib && !cIndOp) return undefined
  if (cst.length !== 3 || cClassTrib.length !== 6 || cIndOp.length !== 6) {
    throw new ErroMapeamentoNacional('IBSCBS_INCOMPLETO', 'IBS/CBS: informe CST, classificação tributária e indicador de operação (os três) ou deixe todos vazios.')
  }
  if (cIndOp.startsWith('02')) {
    throw new ErroMapeamentoNacional('IBSCBS_IMOVEL', `O indicador de operação ${cIndOp} é de operação com bem imóvel e exige os dados do imóvel na nota, que a plataforma ainda não envia. Para serviços em geral (consultoria, contabilidade, TI) use 100301 — corrija na nota e na configuração fiscal do cliente.`)
  }
  if (!cClassTrib.startsWith(cst)) {
    throw new ErroMapeamentoNacional('IBSCBS_CLASSIFICACAO', `A classificação tributária ${cClassTrib} não pertence ao CST ${cst}.`)
  }
  // indDest 0 = o destinatário é o próprio tomador (único caso suportado).
  return { cIndOp, indDest: 0, cst, cClassTrib }
}
