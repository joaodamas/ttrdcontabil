/**
 * Leitura do XML oficial da NFS-e Nacional (raiz <NFSe>, leiaute v1.01) e
 * montagem dos dados exibidos no DANFSe, já formatados conforme a NT 008/2026
 * (SE/CGNFS-e) — "Especificações Técnicas do DANFSe", item 2.4.5.
 *
 * Função pura: sem Firestore, sem Storage, sem rede. O DANFSe só pode exibir o
 * que consta do XML (NT 008, item 2.1), então nada aqui vem do banco.
 */
import { DOMParser } from '@xmldom/xmldom'

import { IBGE_MAP } from '../types'
import {
  AMBIENTE_GERADOR, BENEFICIO_MUNICIPAL, EMITENTE_DPS, FINALIDADE_NFSE, OPCAO_SIMPLES, REGIME_APURACAO_SN,
  REGIME_ESPECIAL, RETENCAO_ISSQN, RETENCAO_PIS_COFINS, SITUACAO_NFSE, SUSPENSAO_EXIGIBILIDADE, TIPO_AMBIENTE,
  TIPO_IMUNIDADE, TRIBUTACAO_ISSQN, descrever, formatarCep, formatarCnpjCpf, formatarCodTribNac, formatarData,
  formatarDataHora, formatarMoeda, formatarNbs, formatarPercentual, somarDecimais, ufDoIbge,
  urlConsultaPublica,
} from './descricoes'

export class DanfseXmlInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'DanfseXmlInvalidoError'
  }
}

/** Valor ausente no XML: a NT 008 (nota 12) manda imprimir um traço. */
export type Campo = string | undefined

export interface PessoaDanfse {
  documento: Campo
  inscricaoMunicipal: Campo
  telefone: Campo
  nome: Campo
  municipioUf: Campo
  ibgeCep: Campo
  endereco: Campo
  email: Campo
}

export interface DadosDanfse {
  chaveAcesso: string
  urlConsulta: string
  /** tpAmb = 2 → "NFS-e SEM VALIDADE JURÍDICA" no cabeçalho. */
  homologacao: boolean
  cabecalho: { municipio: Campo; ambienteGerador: Campo; tipoAmbiente: Campo }
  identificacao: {
    numeroNfse: Campo
    competencia: Campo
    dataHoraEmissaoNfse: Campo
    numeroDps: Campo
    serieDps: Campo
    dataHoraEmissaoDps: Campo
    emitente: Campo
    situacao: Campo
    finalidade: Campo
  }
  prestador: PessoaDanfse & { simplesNacional: Campo; regimeApuracaoSn: Campo }
  /** null → bloco reduzido "NÃO IDENTIFICADO NA NFS-e". */
  tomador: PessoaDanfse | null
  /** 'proprio-tomador' → "O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO". */
  destinatario: PessoaDanfse | 'proprio-tomador' | null
  intermediario: PessoaDanfse | null
  servico: {
    codigoTributacao: Campo
    codigoNbs: Campo
    localPrestacao: Campo
    descricaoCodigoTributacao: Campo
    descricao: Campo
  }
  /** null → "TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN". */
  tributacaoMunicipal: {
    tipoTributacao: Campo
    municipioIncidencia: Campo
    regimeEspecial: Campo
    tipoImunidade: Campo
    suspensaoExigibilidade: Campo
    processoSuspensao: Campo
    beneficioMunicipal: Campo
    calculoBm: Campo
    totalDeducoesReducoes: Campo
    descontoIncondicionado: Campo
    baseCalculo: Campo
    aliquota: Campo
    retencao: Campo
    issqnApurado: Campo
  } | null
  tributacaoFederal: {
    irrf: Campo
    contribuicaoPrevidenciaria: Campo
    contribuicoesSociais: Campo
    pis: Campo
    cofins: Campo
    descricaoContribuicoes: Campo
    /** NT 008, nota 6: linha de PIS/COFINS só para competência até 2026. */
    exibirPisCofins: boolean
  }
  ibsCbs: {
    cstClassTrib: Campo
    indicadorOperacaoIncidencia: Campo
    exclusoesReducoes: Campo
    baseCalculo: Campo
    reducoesAliquota: Campo
    aliquotasIbs: Campo
    aliqEfetivaMunicipal: Campo
    valorMunicipal: Campo
    aliqEfetivaEstadual: Campo
    valorEstadual: Campo
    valorTotalIbs: Campo
    aliquotaCbs: Campo
    aliqEfetivaCbs: Campo
    valorTotalCbs: Campo
  }
  valorTotal: {
    valorServico: Campo
    descontoIncondicionado: Campo
    descontoCondicionado: Campo
    totalRetencoes: Campo
    valorLiquido: Campo
    totalIbsCbs: Campo
    valorLiquidoIbsCbs: Campo
  }
  informacoesComplementares: string[]
  totaisAproximados: string
}

// ─── Navegação no DOM (sem depender de prefixo de namespace) ────────────────

type No = Element

function filhos(no: No | undefined, nome: string): No[] {
  if (!no) return []
  const out: No[] = []
  for (let n = no.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === nome) out.push(n as Element)
  }
  return out
}

/** Desce pelo caminho "a/b/c" (nomes locais), pegando o primeiro de cada nível. */
function el(no: No | undefined, caminho: string): No | undefined {
  let atual = no
  for (const parte of caminho.split('/')) {
    atual = filhos(atual, parte)[0]
    if (!atual) return undefined
  }
  return atual
}

function txt(no: No | undefined, caminho: string): string | undefined {
  const alvo = el(no, caminho)
  const v = alvo?.textContent?.trim()
  return v ? v : undefined
}

function primeiroDescendente(no: No | undefined, nome: string): No | undefined {
  if (!no) return undefined
  const lista = no.getElementsByTagNameNS('*', nome)
  return lista.length > 0 ? (lista.item(0) as Element) : undefined
}

function juntar(partes: Array<string | undefined>, sep: string): string | undefined {
  const v = partes.filter((p) => p !== undefined && p !== '')
  return v.length > 0 ? v.join(sep) : undefined
}

// ─── Montagem ────────────────────────────────────────────────────────────────

interface ContextoMunicipios {
  /** cMun → nome, a partir dos nomes que a própria NFS-e traz. */
  nomes: Record<string, string>
}

function nomeDoMunicipio(ctx: ContextoMunicipios, cMun: string | undefined): string | undefined {
  if (!cMun) return undefined
  return ctx.nomes[cMun] ?? IBGE_MAP[cMun]
}

function municipioUf(ctx: ContextoMunicipios, cMun: string | undefined, uf?: string): string | undefined {
  if (!cMun) return undefined
  const nome = nomeDoMunicipio(ctx, cMun) ?? cMun
  return juntar([nome, uf ?? ufDoIbge(cMun)], ' / ')
}

function pessoa(ctx: ContextoMunicipios, no: No | undefined): PessoaDanfse | null {
  if (!no) return null
  const end = el(no, 'end')
  const endNac = el(end, 'endNac')
  const endExt = el(end, 'endExt')
  const cMun = txt(endNac, 'cMun')
  const documento = formatarCnpjCpf(txt(no, 'CNPJ') ?? txt(no, 'CPF')) ?? txt(no, 'NIF')
  return {
    documento,
    inscricaoMunicipal: txt(no, 'IM'),
    telefone: txt(no, 'fone'),
    nome: txt(no, 'xNome'),
    municipioUf: endExt
      ? juntar([txt(endExt, 'xCidade'), txt(endExt, 'xEstProvReg')], ' / ')
      : municipioUf(ctx, cMun),
    ibgeCep: endExt
      ? juntar([txt(endExt, 'cPais'), txt(endExt, 'cEndPost')], ' / ')
      : juntar([cMun, formatarCep(txt(endNac, 'CEP'))], ' / '),
    endereco: juntar([txt(end, 'xLgr'), txt(end, 'nro'), txt(end, 'xCpl'), txt(end, 'xBairro')], ', '),
    email: txt(no, 'email'),
  }
}

/** Chave de acesso: Id de infNFSe sem o prefixo "NFS" (NT 008, item 2.4.5). */
export function extrairChaveAcesso(infNFSe: No): string {
  const id = infNFSe.getAttribute('Id') ?? ''
  const chave = id.replace(/^NFS/, '')
  if (!/^\d{50}$/.test(chave)) {
    throw new DanfseXmlInvalidoError('Chave de acesso ausente ou inválida no XML da NFS-e.')
  }
  return chave
}

export function lerXmlNfse(xml: string): No {
  if (!xml || typeof xml !== 'string') throw new DanfseXmlInvalidoError('XML da NFS-e vazio.')
  let doc: Document
  try {
    doc = new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: (msg: string) => { throw new DanfseXmlInvalidoError(`XML da NFS-e malformado: ${msg}`) },
        fatalError: (msg: string) => { throw new DanfseXmlInvalidoError(`XML da NFS-e malformado: ${msg}`) },
      },
    }).parseFromString(xml, 'text/xml') as unknown as Document
  } catch (err) {
    if (err instanceof DanfseXmlInvalidoError) throw err
    throw new DanfseXmlInvalidoError(`XML da NFS-e malformado: ${(err as Error).message}`)
  }
  const raiz = doc?.documentElement as No | undefined
  if (!raiz || raiz.localName !== 'NFSe') {
    throw new DanfseXmlInvalidoError(
      'O XML não é de uma NFS-e do padrão nacional (raiz <NFSe>). O DANFSe só é gerado para notas do Sistema Nacional.',
    )
  }
  const inf = el(raiz, 'infNFSe')
  if (!inf) throw new DanfseXmlInvalidoError('XML da NFS-e sem o grupo <infNFSe>.')
  return inf
}

function totaisAproximados(totTrib: No | undefined): string {
  const prefixo = 'Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012:'
  const vTot = el(totTrib, 'vTotTrib')
  const pTot = el(totTrib, 'pTotTrib')
  if (vTot) {
    return `${prefixo} Federais: ${formatarMoeda(txt(vTot, 'vTotTribFed')) ?? '-'}; Estaduais: ${formatarMoeda(txt(vTot, 'vTotTribEst')) ?? '-'}; Municipais: ${formatarMoeda(txt(vTot, 'vTotTribMun')) ?? '-'}`
  }
  if (pTot) {
    return `${prefixo} Federais: ${formatarPercentual(txt(pTot, 'pTotTribFed')) ?? '-'}; Estaduais: ${formatarPercentual(txt(pTot, 'pTotTribEst')) ?? '-'}; Municipais: ${formatarPercentual(txt(pTot, 'pTotTribMun')) ?? '-'}`
  }
  // PREMISSA: a NT não traz o formato para pTotTribSN (optante do Simples
  // Nacional informa um percentual único); exibimos o percentual do SN.
  const pSn = txt(totTrib, 'pTotTribSN')
  if (pSn) return `${prefixo} Simples Nacional: ${formatarPercentual(pSn)}`
  return `${prefixo} Não informados`
}

export function montarDadosDanfse(xml: string): DadosDanfse {
  const inf = lerXmlNfse(xml)
  const chaveAcesso = extrairChaveAcesso(inf)
  const infDPS = el(inf, 'DPS/infDPS')
  if (!infDPS) throw new DanfseXmlInvalidoError('XML da NFS-e sem a DPS (<DPS><infDPS>).')

  const emit = el(inf, 'emit')
  const prest = el(infDPS, 'prest')
  const regTrib = el(prest, 'regTrib')
  const serv = el(infDPS, 'serv')
  const valoresDps = el(infDPS, 'valores')
  const tribMun = el(valoresDps, 'trib/tribMun')
  const tribFed = el(valoresDps, 'trib/tribFed')
  const piscofins = el(tribFed, 'piscofins')
  const valoresNfse = el(inf, 'valores')
  const ibscbsDps = el(infDPS, 'IBSCBS')
  const ibscbsNfse = el(inf, 'IBSCBS')
  const valIbs = el(ibscbsNfse, 'valores')
  const totCIBS = el(ibscbsNfse, 'totCIBS')

  const ctx: ContextoMunicipios = { nomes: {} }
  const registrar = (cMun: string | undefined, nome: string | undefined) => {
    if (cMun && nome && !ctx.nomes[cMun]) ctx.nomes[cMun] = nome
  }
  registrar(txt(infDPS, 'cLocEmi'), txt(inf, 'xLocEmi'))
  registrar(txt(inf, 'cLocIncid'), txt(inf, 'xLocIncid'))
  registrar(txt(serv, 'locPrest/cLocPrestacao'), txt(inf, 'xLocPrestacao'))
  registrar(txt(ibscbsNfse, 'cLocalidadeIncid'), txt(ibscbsNfse, 'xLocalidadeIncid'))

  // Prestador: dados da DPS (prest) com o grupo emit da NFS-e como complemento
  // — na emissão pelo próprio prestador a DPS costuma trazer só CNPJ/regTrib,
  // e nome/endereço vêm em emit/enderNac.
  const enderEmit = el(emit, 'enderNac')
  const ehPrestadorEmitente = txt(infDPS, 'tpEmit') === '1' || !txt(infDPS, 'tpEmit')
  const basePrest = pessoa(ctx, prest) ?? {
    documento: undefined, inscricaoMunicipal: undefined, telefone: undefined, nome: undefined,
    municipioUf: undefined, ibgeCep: undefined, endereco: undefined, email: undefined,
  }
  const cMunEmit = txt(enderEmit, 'cMun')
  const prestador = {
    ...basePrest,
    ...(ehPrestadorEmitente ? {
      inscricaoMunicipal: basePrest.inscricaoMunicipal ?? txt(emit, 'IM'),
      telefone: basePrest.telefone ?? txt(emit, 'fone'),
      nome: basePrest.nome ?? txt(emit, 'xNome'),
      municipioUf: basePrest.municipioUf ?? municipioUf(ctx, cMunEmit, txt(enderEmit, 'UF')),
      ibgeCep: basePrest.ibgeCep ?? juntar([cMunEmit, formatarCep(txt(enderEmit, 'CEP'))], ' / '),
      endereco: basePrest.endereco
        ?? juntar([txt(enderEmit, 'xLgr'), txt(enderEmit, 'nro'), txt(enderEmit, 'xCpl'), txt(enderEmit, 'xBairro')], ', '),
      email: basePrest.email ?? txt(emit, 'email'),
    } : {}),
    simplesNacional: descrever(OPCAO_SIMPLES, txt(regTrib, 'opSimpNac')),
    regimeApuracaoSn: descrever(REGIME_APURACAO_SN, txt(regTrib, 'regApTribSN')),
  }

  let destinatario: DadosDanfse['destinatario'] = null
  const dest = el(ibscbsDps, 'dest')
  if (dest) destinatario = pessoa(ctx, dest)
  else if (txt(ibscbsDps, 'indDest') === '0') destinatario = 'proprio-tomador'

  // Município do cabeçalho: xLocEmi + UF do emitente (NT 008, item 2.4.5).
  const ufEmit = txt(enderEmit, 'UF') ?? ufDoIbge(txt(infDPS, 'cLocEmi'))
  const cTribNac = txt(serv, 'cServ/cTribNac')
  const cTribMun = txt(serv, 'cServ/cTribMun')
  const cPaisPrest = txt(serv, 'locPrest/cPaisPrestacao')
  const cLocPrest = txt(serv, 'locPrest/cLocPrestacao')

  const tributacaoMunicipal: DadosDanfse['tributacaoMunicipal'] = tribMun ? {
    tipoTributacao: descrever(TRIBUTACAO_ISSQN, txt(tribMun, 'tribISSQN')),
    municipioIncidencia: txt(inf, 'xLocIncid')
      ? juntar([txt(inf, 'xLocIncid'), ufDoIbge(txt(inf, 'cLocIncid')), txt(tribMun, 'cPaisResult') ?? 'BR'], ' / ')
      : (txt(tribMun, 'cPaisResult') ? `Exterior / ${txt(tribMun, 'cPaisResult')}` : undefined),
    regimeEspecial: descrever(REGIME_ESPECIAL, txt(regTrib, 'regEspTrib')),
    tipoImunidade: descrever(TIPO_IMUNIDADE, txt(tribMun, 'tpImunidade')),
    suspensaoExigibilidade: descrever(SUSPENSAO_EXIGIBILIDADE, txt(tribMun, 'exigSusp/tpSusp')),
    processoSuspensao: txt(tribMun, 'exigSusp/nProcesso'),
    beneficioMunicipal: descrever(BENEFICIO_MUNICIPAL, txt(valoresNfse, 'tpBM')),
    calculoBm: formatarMoeda(txt(valoresNfse, 'vCalcBM') ?? txt(tribMun, 'BM/vRedBCBM')),
    totalDeducoesReducoes: formatarMoeda(somarDecimais(
      txt(valoresDps, 'vDedRed/vDR') ?? txt(valoresNfse, 'vCalcDR'),
      txt(valIbs, 'vCalcReeRepRes'),
    )),
    descontoIncondicionado: formatarMoeda(txt(valoresDps, 'vDescCondIncond/vDescIncond')),
    baseCalculo: formatarMoeda(txt(valoresNfse, 'vBC')),
    aliquota: formatarPercentual(txt(valoresNfse, 'pAliqAplic')),
    retencao: descrever(RETENCAO_ISSQN, txt(tribMun, 'tpRetISSQN')),
    issqnApurado: formatarMoeda(txt(valoresNfse, 'vISSQN')),
  } : null

  const dCompet = txt(infDPS, 'dCompet')
  const anoCompetencia = Number(dCompet?.slice(0, 4))

  const vIBSTot = txt(totCIBS, 'gIBS/vIBSTot')
  const vCBS = txt(totCIBS, 'gCBS/vCBS')

  const infoCompl = el(serv, 'infoCompl')
  const imovel = el(ibscbsDps, 'imovel')
  const complementares = [
    txt(infoCompl, 'xInfComp') && `Inf. Cont.: ${txt(infoCompl, 'xInfComp')}`,
    txt(infDPS, 'subst/chSubstda') && `NFS-e Subst.: ${txt(infDPS, 'subst/chSubstda')}`,
    txt(infoCompl, 'docRef') && `Doc. Ref.: ${txt(infoCompl, 'docRef')}`,
    txt(serv, 'obra/cObra') && `Cod. Obra: ${txt(serv, 'obra/cObra')}`,
    (txt(imovel, 'inscImobFisc') ?? txt(serv, 'obra/inscImobFisc'))
      && `Insc. Imob.: ${txt(imovel, 'inscImobFisc') ?? txt(serv, 'obra/inscImobFisc')}`,
    txt(serv, 'atvEvento/idAtvEvt') && `Cod. Evt.: ${txt(serv, 'atvEvento/idAtvEvt')}`,
    txt(infoCompl, 'idDocTec') && `Doc. Tec.: ${txt(infoCompl, 'idDocTec')}`,
    txt(infoCompl, 'xPed') && `Núm. Ped.: ${txt(infoCompl, 'xPed')}`,
    filhos(el(infoCompl, 'gItemPed'), 'xItemPed').length > 0
      && `Item Ped.: ${filhos(el(infoCompl, 'gItemPed'), 'xItemPed').map((n) => n.textContent?.trim()).join(', ')}`,
    txt(inf, 'xOutInf') && `Inf. A. T. Mun.: ${txt(inf, 'xOutInf')}`,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0)

  const gIBSCBS = el(ibscbsDps, 'valores/trib/gIBSCBS')
  const finalidade = txt(ibscbsDps, 'finNFSe') ?? txt(infDPS, 'finNFSe') ?? primeiroDescendente(infDPS, 'finNFSe')?.textContent?.trim()

  return {
    chaveAcesso,
    urlConsulta: urlConsultaPublica(chaveAcesso),
    homologacao: txt(infDPS, 'tpAmb') === '2',
    cabecalho: {
      municipio: txt(inf, 'xLocEmi') ? juntar([txt(inf, 'xLocEmi'), ufEmit], ' / ') : undefined,
      ambienteGerador: descrever(AMBIENTE_GERADOR, txt(inf, 'ambGer')),
      tipoAmbiente: descrever(TIPO_AMBIENTE, txt(infDPS, 'tpAmb')),
    },
    identificacao: {
      numeroNfse: txt(inf, 'nNFSe'),
      competencia: formatarData(dCompet),
      dataHoraEmissaoNfse: formatarDataHora(txt(inf, 'dhProc')),
      numeroDps: txt(infDPS, 'nDPS'),
      serieDps: txt(infDPS, 'serie'),
      dataHoraEmissaoDps: formatarDataHora(txt(infDPS, 'dhEmi')),
      emitente: descrever(EMITENTE_DPS, txt(infDPS, 'tpEmit')),
      situacao: descrever(SITUACAO_NFSE, txt(inf, 'cStat')),
      finalidade: descrever(FINALIDADE_NFSE, finalidade || undefined),
    },
    prestador,
    tomador: pessoa(ctx, el(infDPS, 'toma')),
    destinatario,
    intermediario: pessoa(ctx, el(infDPS, 'interm')),
    servico: {
      codigoTributacao: juntar([formatarCodTribNac(cTribNac), cTribMun], ' / '),
      codigoNbs: formatarNbs(txt(serv, 'cServ/cNBS')),
      localPrestacao: cLocPrest
        ? juntar([nomeDoMunicipio(ctx, cLocPrest) ?? cLocPrest, ufDoIbge(cLocPrest), 'BR'], ' / ')
        : (cPaisPrest ? `Exterior / ${cPaisPrest}` : undefined),
      // NT 008: SE xTribMun <> "" ENTÃO descrição municipal SENÃO a nacional.
      descricaoCodigoTributacao: txt(inf, 'xTribMun') ?? txt(inf, 'xTribNac'),
      descricao: txt(serv, 'cServ/xDescServ'),
    },
    tributacaoMunicipal,
    tributacaoFederal: {
      irrf: formatarMoeda(txt(tribFed, 'vRetIRRF')),
      contribuicaoPrevidenciaria: formatarMoeda(txt(tribFed, 'vRetCP')),
      contribuicoesSociais: formatarMoeda(txt(tribFed, 'vRetCSLL')),
      pis: formatarMoeda(txt(piscofins, 'vPis')),
      cofins: formatarMoeda(txt(piscofins, 'vCofins')),
      descricaoContribuicoes: descrever(RETENCAO_PIS_COFINS, txt(piscofins, 'tpRetPisCofins')),
      exibirPisCofins: !Number.isFinite(anoCompetencia) || anoCompetencia <= 2026,
    },
    ibsCbs: {
      cstClassTrib: juntar([txt(gIBSCBS, 'CST'), txt(gIBSCBS, 'cClassTrib')], ' / '),
      indicadorOperacaoIncidencia: juntar([
        txt(ibscbsDps, 'cIndOp'),
        txt(ibscbsNfse, 'cLocalidadeIncid'),
        txt(ibscbsNfse, 'xLocalidadeIncid'),
        ufDoIbge(txt(ibscbsNfse, 'cLocalidadeIncid')),
      ], ' / '),
      exclusoesReducoes: ibscbsNfse ? formatarMoeda(somarDecimais(
        txt(valoresDps, 'vDescCondIncond/vDescIncond'),
        txt(valIbs, 'vCalcReeRepRes'),
        txt(valoresNfse, 'vISSQN'),
        txt(piscofins, 'vPis'),
        txt(piscofins, 'vCofins'),
      )) : undefined,
      baseCalculo: formatarMoeda(txt(valIbs, 'vBC')),
      reducoesAliquota: ibscbsNfse ? juntar([
        formatarPercentual(txt(valIbs, 'uf/pRedAliqUF')) ?? '-',
        formatarPercentual(txt(valIbs, 'mun/pRedAliqMun')) ?? '-',
        formatarPercentual(txt(valIbs, 'fed/pRedAliqCBS')) ?? '-',
      ], ' / ') : undefined,
      aliquotasIbs: ibscbsNfse ? juntar([
        formatarPercentual(txt(valIbs, 'uf/pIBSUF')) ?? '-',
        formatarPercentual(txt(valIbs, 'mun/pIBSMun')) ?? '-',
      ], ' / ') : undefined,
      aliqEfetivaMunicipal: formatarPercentual(txt(valIbs, 'mun/pAliqEfetMun')),
      valorMunicipal: formatarMoeda(txt(totCIBS, 'gIBS/gIBSMunTot/vIBSMun')),
      aliqEfetivaEstadual: formatarPercentual(txt(valIbs, 'uf/pAliqEfetUF')),
      valorEstadual: formatarMoeda(txt(totCIBS, 'gIBS/gIBSUFTot/vIBSUF')),
      valorTotalIbs: formatarMoeda(vIBSTot),
      aliquotaCbs: formatarPercentual(txt(valIbs, 'fed/pCBS')),
      aliqEfetivaCbs: formatarPercentual(txt(valIbs, 'fed/pAliqEfetCBS')),
      valorTotalCbs: formatarMoeda(vCBS),
    },
    valorTotal: {
      valorServico: formatarMoeda(txt(valoresDps, 'vServPrest/vServ')),
      descontoIncondicionado: formatarMoeda(txt(valoresDps, 'vDescCondIncond/vDescIncond')),
      descontoCondicionado: formatarMoeda(txt(valoresDps, 'vDescCondIncond/vDescCond')),
      totalRetencoes: formatarMoeda(txt(valoresNfse, 'vTotalRet')),
      valorLiquido: formatarMoeda(txt(valoresNfse, 'vLiq')),
      totalIbsCbs: formatarMoeda(somarDecimais(vIBSTot, vCBS)),
      valorLiquidoIbsCbs: formatarMoeda(txt(totCIBS, 'vTotNF')),
    },
    informacoesComplementares: complementares,
    totaisAproximados: totaisAproximados(el(valoresDps, 'trib/totTrib')),
  }
}

/** Resumo para nome de arquivo/metadados (sem formatar). */
export function resumoNfse(xml: string): { chaveAcesso: string; numeroNfse?: string } {
  const inf = lerXmlNfse(xml)
  return { chaveAcesso: extrairChaveAcesso(inf), numeroNfse: txt(inf, 'nNFSe') }
}

