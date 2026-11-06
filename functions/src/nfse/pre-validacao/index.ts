/**
 * Motor ÚNICO de pré-validação fiscal da NFS-e — PURO (sem I/O, sem relógio).
 *
 * Roda nos dois lados com o mesmo código:
 *  - navegador (formulário de emissão, configuração fiscal, emissão em lote):
 *    mostra o problema ao lado do campo e bloqueia o botão;
 *  - servidor (processarEmissao: formulário, lote, cron, retry): roda ANTES de
 *    criar/travar o rascunho e reservar o nDPS — bloqueio = HttpsError
 *    failed-precondition, sem gastar número e sem chamar a Sefin.
 *
 * Por quê: a primeira nota em produção voltou com E0932 (cIndOp de imóvel) e a
 * seguinte com E0322 (IBS/CBS sem NBS) — erros que só apareciam DEPOIS do envio.
 * Cada regra cita o código da Sefin que evita (Anexo I/VI da NFS-e Nacional,
 * src/lib/nfse-dominios/regras-dps.json) e diz o que fazer.
 *
 * Severidade:
 *  - 'bloqueio' — a Sefin recusaria a DPS (ou a plataforma ainda não monta o
 *    grupo exigido, ou o dado está comprovadamente errado). Não deixa emitir.
 *  - 'aviso'    — vale conferir, mas pode estar certo. Não bloqueia.
 *
 * As tabelas oficiais vêm de catalogos.json (gerado por
 * scripts/catalogo-pre-validacao.mjs a partir de src/lib/nfse-dominios).
 */
import catalogos from './catalogos.json'
import { cnpjDoTitularCertificado, cpfCnpjValido, emailValido, soDigitos } from './documentos'
import { ErroMapeamentoNacional, mapearCodigoTributacaoNacional, mapearRegime } from '../nacional/mapeamento'
import { resolverProvedorNfse } from '../provedor'
import { normalizarIbge } from '../types'
import type { ConfigFiscalCliente, Servico, Tomador } from '../types'

export { cnpjDoTitularCertificado, cpfCnpjValido, cpfValido, cnpjValido } from './documentos'

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type SeveridadeFiscal = 'bloqueio' | 'aviso'

/**
 * Campo lógico do achado. O formulário traduz para o seu campo (ex.:
 * 'servico.codigoNbs' → codigoNbs). Os de 'config.*', 'prestador.*' e
 * 'certificado' se corrigem na configuração fiscal / cadastro do cliente.
 */
export type CampoFiscal =
  | 'prestador.cnpj' | 'prestador.razaoSocial' | 'prestador.inscricaoMunicipal' | 'prestador.municipio'
  | 'config.regime' | 'config.ambiente' | 'config.naturezaOperacao' | 'config.aliquotaSimplesNacional'
  | 'certificado'
  | 'tomador.cpfCnpj' | 'tomador.razaoSocial' | 'tomador.email' | 'tomador.endereco' | 'tomador.cep' | 'tomador.municipio'
  | 'servico.discriminacao' | 'servico.codigoServico' | 'servico.itemListaServico' | 'servico.codigoTributacaoNacional'
  | 'servico.codigoNbs' | 'servico.municipioPrestacao' | 'servico.valorServico' | 'servico.valorDeducoes'
  | 'servico.descontos' | 'servico.aliquota' | 'servico.issRetido' | 'servico.retencoes' | 'servico.informacoesComplementares'
  | 'servico.ibsCbsCst' | 'servico.ibsCbsClassTrib' | 'servico.ibsCbsIndOp'
  | 'dataCompetencia'

export interface AchadoFiscal {
  /** Identificador estável da regra (para teste e para não repetir mensagem). */
  regra: string
  campo: CampoFiscal
  severidade: SeveridadeFiscal
  /** Rejeição da Sefin que a regra evita, quando há uma. */
  codigoSefin?: string
  /** pt-BR: o que está errado e o que fazer. */
  mensagem: string
}

/** Metadados do A1 gravados por uploadCertificado em clientes_fiscal.credenciais. */
export interface CertificadoGravado {
  certificadoStoragePath?: unknown
  certTitular?: unknown
  certVencimento?: unknown
  certValido?: unknown
}

export interface EntradaPreValidacao {
  nota: {
    tomador?: Partial<Tomador> | null
    servico?: Partial<Servico> | null
    /** AAAA-MM-DD. Vazio = mês da emissão (servidor). */
    dataCompetencia?: string | null
  }
  config: Partial<Omit<ConfigFiscalCliente, 'credenciais'>> & { credenciais?: CertificadoGravado | Record<string, unknown> | null }
  prestador: { cnpj?: string | null; razaoSocial?: string | null; inscricaoMunicipal?: string | null; municipioIbge?: string | null }
  /** Hoje (AAAA-MM-DD, fuso de Brasília). Injetado: o motor não lê relógio. */
  hoje: string
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

interface Classificacao { cst: string; cClassTrib: string; inicio: string | null; fim: string | null; regular: boolean }
interface Catalogo {
  conveniosConsultadosEm: string
  servicos: string[]
  nbs: string[]
  indicadoresOperacao: string[]
  classificacoes: Classificacao[]
  incidencia: Record<string, { i: string[]; g: string | null }>
  correlacaoItemNbs: Record<string, string[]>
  municipios: Record<string, string>
}
const CAT = catalogos as Catalogo
const SERVICOS = new Set(CAT.servicos)
const NBS_EMITIVEIS = new Set(CAT.nbs)
const INDICADORES = new Set(CAT.indicadoresOperacao)
const CLASSIFICACOES = new Map(CAT.classificacoes.map((c) => [c.cClassTrib, c]))
const CSTS = new Set(CAT.classificacoes.map((c) => c.cst))

/**
 * NBS (9 dígitos) que o Anexo VIII correlaciona ao cTribNac. A tabela é por
 * item da LC 116 (4 dígitos, ex. 1719) e, no grupo 99, pelo código completo
 * (6 dígitos). undefined = serviço fora da tabela (sem checagem).
 */
export function nbsCorrelacionadas(cTribNac: string | null | undefined): string[] | undefined {
  const c = soDigitos(cTribNac)
  if (c.length !== 6) return undefined
  return CAT.correlacaoItemNbs[c] ?? CAT.correlacaoItemNbs[c.slice(0, 4)]
}

/** Situação do município no Sistema Nacional: E emissor, A só compartilha, S sem convênio, ? fora do retrato, undefined = IBGE inexistente. */
function situacaoMunicipio(ibge: string): string | undefined {
  return CAT.municipios[ibge]
}

export function municipioIbgeExiste(ibge: string | null | undefined): boolean {
  return situacaoMunicipio(normalizarIbge(soDigitos(ibge))) !== undefined
}

// ─── Constantes das regras ─────────────────────────────────────────────────

/** IBS/CBS só a partir da competência 01/2026 (E0850). */
const INICIO_IBSCBS = '2026-01-01'
/**
 * PREMISSA (pedido do dono, 2026-11-06): a partir desta competência, aviso
 * quando o regime normal (Presumido/Real) emite sem IBS/CBS. Não é rejeição da
 * Sefin hoje — só lembrete. Ajustar quando a obrigatoriedade for regulamentada.
 */
const AVISO_IBSCBS_REGIME_NORMAL_DESDE = '2026-10-01'
/** tpOper obrigatório (que a plataforma não envia) com IBS/CBS nestes itens (E0903). */
const ITENS_EXIGEM_TPOPER = new Set(['2505', '1509', '1712', '1005'])
/** Teto do ISS (LC 116, art. 8º, II) — E0595. Piso de 2% (LC 157, art. 8º-A) vira aviso: o Simples tem alíquota efetiva própria. */
const ALIQUOTA_ISS_MAXIMA = 5
const ALIQUOTA_ISS_MINIMA = 2
const DIAS_AVISO_CERTIFICADO = 15

// ─── Utilidades ─────────────────────────────────────────────────────────────

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function positivo(v: unknown): boolean {
  const n = numero(v)
  return n !== undefined && n > 0
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
function mesAno(iso: string): string {
  const [a, m] = iso.split('-')
  return `${m}/${a}`
}
/** Soma meses a uma data AAAA-MM-DD (dia 1). */
function somarMeses(iso: string, meses: number): string {
  const [a, m] = iso.split('-').map(Number)
  const total = a * 12 + (m - 1) + meses
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/** Hoje em Brasília (AAAA-MM-DD) — para quem chama o motor (ele não lê relógio). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

type Regime = 'mei' | 'simples' | 'normal'

class Coletor {
  readonly achados: AchadoFiscal[] = []
  bloqueio(regra: string, campo: CampoFiscal, mensagem: string, codigoSefin?: string) {
    this.achados.push({ regra, campo, severidade: 'bloqueio', mensagem, ...(codigoSefin ? { codigoSefin } : {}) })
  }
  aviso(regra: string, campo: CampoFiscal, mensagem: string, codigoSefin?: string) {
    this.achados.push({ regra, campo, severidade: 'aviso', mensagem, ...(codigoSefin ? { codigoSefin } : {}) })
  }
}

/** Dados que valem para a nota (precedência nota > configuração, igual ao mapeamento nacional). */
interface Resolvido {
  nacional: boolean
  producao: boolean
  regime: Regime
  cTribNac?: string
  nbs: string
  nbsBruto: string
  cst: string
  cClassTrib: string
  cIndOp: string
  aliquota?: number
  issRetido: boolean
  competencia: string
}

function resolver(e: EntradaPreValidacao, c: Coletor, apenasConfig: boolean): Resolvido {
  const { config } = e
  const s = (e.nota.servico ?? {}) as Partial<Servico>
  const regimeDps = mapearRegime({
    regimeTributario: config.regimeTributario as ConfigFiscalCliente['regimeTributario'],
    optanteSimples: config.optanteSimples === true,
  })
  const regime: Regime = regimeDps.opSimpNac === 2 ? 'mei' : regimeDps.opSimpNac === 3 ? 'simples' : 'normal'

  let cTribNac: string | undefined
  const item = texto(s.itemListaServico) || texto(config.itemListaServico)
  const override = texto(s.codigoTributacaoNacional) || texto(config.codigoTributacaoNacional)
  if (item || override) {
    try {
      cTribNac = mapearCodigoTributacaoNacional(item, override)
    } catch (err) {
      if (err instanceof ErroMapeamentoNacional) {
        c.bloqueio('ctribnac_formato', override ? 'servico.codigoTributacaoNacional' : 'servico.itemListaServico', err.message)
      } else throw err
    }
  } else if (!apenasConfig) {
    c.bloqueio('item_lista_ausente', 'servico.itemListaServico', 'Informe o item da lista de serviço (LC 116) — ex.: 17.19 — ou o código de tributação nacional.')
  }

  const nbsBruto = texto(s.codigoNbs) || texto(config.codigoNbs)
  const dataComp = texto(e.nota.dataCompetencia)
  return {
    nacional: resolverProvedorNfse(config as Pick<ConfigFiscalCliente, 'provedorNfse'>) === 'nacional',
    producao: config.ambienteEmissao === 'producao',
    regime,
    cTribNac,
    nbsBruto,
    nbs: soDigitos(nbsBruto),
    cst: soDigitos(texto(s.ibsCbsCst) || texto(config.ibsCbsCst)),
    cClassTrib: soDigitos(texto(s.ibsCbsClassTrib) || texto(config.ibsCbsClassTrib)),
    cIndOp: soDigitos(texto(s.ibsCbsIndOp) || texto(config.ibsCbsIndOp)),
    aliquota: numero(s.aliquota) ?? numero(config.aliquotaPadrao),
    issRetido: s.issRetido === true,
    competencia: /^\d{4}-\d{2}-\d{2}$/.test(dataComp) ? dataComp : e.hoje,
  }
}

// ─── Regras: prestador, regime, município, certificado ─────────────────────

function regrasPrestador(e: EntradaPreValidacao, r: Resolvido, c: Coletor, apenasConfig: boolean) {
  const { config, prestador } = e

  if (!apenasConfig) {
    if (!cpfCnpjValido(prestador.cnpj)) {
      c.bloqueio('prestador_cnpj', 'prestador.cnpj', 'CNPJ do prestador inválido (dígito verificador). Corrija o CNPJ no cadastro do cliente.', 'E0080')
    }
    const nome = texto(prestador.razaoSocial)
    if (nome.length < 2 || nome.length > 200) {
      c.bloqueio('prestador_razao', 'prestador.razaoSocial', 'Razão social do prestador inválida. Corrija no cadastro do cliente.')
    }
  }

  // Inscrição municipal: obrigatória só no webservice da prefeitura (M6); no
  // Nacional é opcional, mas se vier precisa ser plausível.
  const im = texto(prestador.inscricaoMunicipal ?? config.inscricaoMunicipal)
  if ((!r.nacional || im) && (im.length < 2 || im.length > 30)) {
    c.bloqueio('prestador_im', 'prestador.inscricaoMunicipal', 'Inscrição municipal do prestador inválida.')
  }

  if (config.ambienteEmissao !== 'producao' && config.ambienteEmissao !== 'homologacao') {
    c.bloqueio('ambiente', 'config.ambiente', 'Ambiente fiscal inválido: escolha Homologação ou Produção na configuração fiscal.')
  }

  if (!texto(config.regimeTributario)) {
    c.bloqueio('regime_ausente', 'config.regime', 'Informe o regime tributário do cliente na configuração fiscal.')
  } else if (config.optanteSimples === true && (config.regimeTributario === 'lucro_presumido' || config.regimeTributario === 'lucro_real')) {
    // mapearRegime trataria como ME/EPP do Simples (opSimpNac 3 + regApTribSN):
    // a Sefin confere com o cadastro do Simples (E0160) e recusa.
    c.bloqueio('regime_incoerente', 'config.regime', 'Regime incoerente: "optante pelo Simples" está marcado, mas o regime é Lucro Presumido/Real. Desmarque o Simples ou corrija o regime na configuração fiscal.', 'E0160')
  }

  // Município do prestador (cLocEmi)
  const ibge = normalizarIbge(soDigitos(prestador.municipioIbge ?? config.municipioIbge))
  if (!/^\d{7}$/.test(ibge) || situacaoMunicipio(ibge) === undefined) {
    c.bloqueio('municipio_ibge', 'prestador.municipio', 'Município IBGE do prestador inválido. Escolha o município na configuração fiscal.')
  } else if (r.nacional) {
    const sit = situacaoMunicipio(ibge)
    const nome = texto(config.municipioEmissor) || `O município ${ibge}`
    // Na homologação (produção restrita) a Sefin aceita qualquer município: lá é aviso.
    const registrar = r.producao ? c.bloqueio.bind(c) : c.aviso.bind(c)
    if (sit === 'S') {
      registrar('municipio_sem_convenio', 'prestador.municipio', `${nome} não tem convênio com o Sistema Nacional da NFS-e — a nota deste cliente não pode sair pelo Ambiente Nacional (emita no portal da prefeitura).`, 'E0037')
    } else if (sit === 'A') {
      registrar('municipio_sem_emissor_nacional', 'prestador.municipio', `${nome} tem convênio com o Ambiente Nacional, mas não usa o Emissor Nacional (mantém emissor próprio) — emita no portal da prefeitura.`, 'E0037')
    } else if (sit === '?') {
      c.aviso('municipio_situacao_desconhecida', 'prestador.municipio', `Não sabemos se ${nome} emite pelo Ambiente Nacional (consulta de ${dataBr(CAT.conveniosConsultadosEm)}). A plataforma confere o convênio na hora do envio.`)
    }
  }

  if (r.nacional && !apenasConfig) regrasCertificado(e, c)
}

function regrasCertificado(e: EntradaPreValidacao, c: Coletor) {
  const cred = (e.config.credenciais ?? {}) as CertificadoGravado
  if (!texto(cred.certificadoStoragePath)) {
    c.bloqueio('certificado_ausente', 'certificado', 'Cliente sem certificado A1: a emissão pelo Ambiente Nacional é assinada com o A1 do próprio cliente. Envie o certificado na configuração fiscal.', 'E0714')
    return
  }
  if (cred.certValido === false) {
    c.bloqueio('certificado_invalido', 'certificado', 'O certificado A1 gravado para o cliente foi marcado como inválido. Envie um certificado A1 válido na configuração fiscal.', 'E1200')
    return
  }
  const venc = texto(cred.certVencimento)
  if (/^\d{4}-\d{2}-\d{2}/.test(venc)) {
    const dia = venc.slice(0, 10)
    if (dia < e.hoje) {
      c.bloqueio('certificado_vencido', 'certificado', `O certificado A1 do cliente venceu em ${dataBr(dia)}. Envie um certificado válido na configuração fiscal.`, 'E1200')
    } else {
      const limite = new Date(`${e.hoje}T00:00:00Z`)
      limite.setUTCDate(limite.getUTCDate() + DIAS_AVISO_CERTIFICADO)
      if (dia <= limite.toISOString().slice(0, 10)) {
        c.aviso('certificado_vencendo', 'certificado', `O certificado A1 do cliente vence em ${dataBr(dia)}. Providencie a renovação.`)
      }
    }
  }
  const cnpjCert = cnpjDoTitularCertificado(cred.certTitular)
  const cnpjPrest = soDigitos(e.prestador.cnpj)
  if (cnpjCert && cnpjPrest.length === 14 && cnpjCert !== cnpjPrest) {
    if (cnpjCert.slice(0, 8) !== cnpjPrest.slice(0, 8)) {
      c.bloqueio('certificado_outro_cnpj', 'certificado', `O certificado A1 enviado é de outro CNPJ (${cnpjCert}), não do prestador (${cnpjPrest}). Envie o certificado do próprio cliente.`, 'E0718')
    } else {
      c.aviso('certificado_outro_estabelecimento', 'certificado', `O certificado A1 é de outro estabelecimento da mesma empresa (${cnpjCert}); o prestador é ${cnpjPrest}. Confirme que a Sefin aceita esse certificado.`, 'E0718')
    }
  }
}

// ─── Regras: serviço (cTribNac, NBS, local) ────────────────────────────────

function regrasServico(e: EntradaPreValidacao, r: Resolvido, c: Coletor, apenasConfig: boolean) {
  const s = (e.nota.servico ?? {}) as Partial<Servico>
  if (r.cTribNac && r.nacional) {
    const campo: CampoFiscal = texto(s.codigoTributacaoNacional) || texto(e.config.codigoTributacaoNacional) ? 'servico.codigoTributacaoNacional' : 'servico.itemListaServico'
    if (r.cTribNac.startsWith('99')) {
      c.bloqueio('ctribnac_99', campo, `O código ${r.cTribNac} (grupo 99 — operações sem ISSQN / locação / novos fatos de IBS/CBS) não pode ser emitido pela plataforma: exige campos que ela ainda não envia. Emita pelo portal.`, r.cTribNac.startsWith('9903') || r.cTribNac === '990401' ? 'E0309' : 'E0532')
    } else if (!SERVICOS.has(r.cTribNac)) {
      c.bloqueio('ctribnac_inexistente', campo, `O código de tributação nacional ${r.cTribNac} não existe na lista nacional de serviços. Escolha o código na lista (ex.: 171901 para contabilidade).`, 'E0310')
    } else {
      const inc = CAT.incidencia[r.cTribNac]
      if (inc?.g === 'obra') {
        c.bloqueio('ctribnac_exige_obra', campo, `O serviço ${r.cTribNac} (construção civil) exige o grupo de informações da obra na DPS, que a plataforma ainda não envia. Emita pelo portal.`, 'E0370')
      } else if (inc?.g === 'atvEvento') {
        c.bloqueio('ctribnac_exige_evento', campo, `O serviço ${r.cTribNac} (item 12 — eventos) exige o grupo de informações do evento na DPS, que a plataforma ainda não envia. Emita pelo portal.`, 'E0390')
      }
      if (!apenasConfig) {
        if (inc?.i.includes('ET') && !enderecoCompleto(e.nota.tomador)) {
          c.bloqueio('tomador_endereco_incidencia', 'tomador.endereco', `No serviço ${r.cTribNac} o ISS é devido no município do tomador: informe o endereço completo do tomador (CEP, logradouro, número, bairro e município).`, 'E0234')
        }
        if (inc?.i.includes('LP') && !texto(s.municipioPrestacao)) {
          c.aviso('local_prestacao_incidencia', 'servico.municipioPrestacao', `No serviço ${r.cTribNac} o ISS é devido no local da prestação. Sem o local informado, vale o município do prestador — confirme.`)
        }
      }
    }
  }

  // NBS
  if (r.nbsBruto && r.nacional) {
    if (r.nbs.length !== 9 || !/^[\d.\s-]+$/.test(r.nbsBruto)) {
      c.bloqueio('nbs_formato', 'servico.codigoNbs', `Código NBS "${r.nbsBruto}" inválido: são 9 dígitos (ex.: 1.1302.21.00).`, 'E0316')
    } else if (!NBS_EMITIVEIS.has(r.nbs)) {
      c.bloqueio('nbs_inexistente', 'servico.codigoNbs', `O NBS ${r.nbsBruto} não existe na tabela NBS 2.0 (ou é título de grupo). Escolha um código de 9 dígitos na lista.`, 'E0316')
    } else if (r.cTribNac) {
      const compativeis = nbsCorrelacionadas(r.cTribNac)
      if (compativeis && compativeis.length > 0 && !compativeis.includes(r.nbs)) {
        c.bloqueio('nbs_incompativel', 'servico.codigoNbs', `O NBS ${formatarNbs(r.nbs)} não corresponde ao serviço ${r.cTribNac.slice(0, 2)}.${r.cTribNac.slice(2, 4)} pela tabela oficial de correlação (Anexo VIII da NFS-e). Escolha um destes: ${compativeis.map(formatarNbs).join(', ')}.`)
      }
    }
  }

  if (apenasConfig) return

  // Local da prestação
  const local = soDigitos(s.municipioPrestacao)
  if (texto(s.municipioPrestacao) && (local.length !== 7 || !municipioIbgeExiste(local))) {
    c.bloqueio('local_prestacao_ibge', 'servico.municipioPrestacao', 'Município do local da prestação inválido (código IBGE inexistente). Escolha o município na lista ou deixe vazio para usar o do prestador.', 'E0302')
  }
}

export function formatarNbs(nbs: string): string {
  const d = soDigitos(nbs)
  return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7, 9)}` : nbs
}

// ─── Regras: IBS/CBS ────────────────────────────────────────────────────────

function regrasIbsCbs(r: Resolvido, c: Coletor) {
  if (!r.nacional) return
  const { cst, cClassTrib, cIndOp } = r
  const algum = Boolean(cst || cClassTrib || cIndOp)
  if (!algum) {
    if (r.regime === 'normal' && r.competencia >= AVISO_IBSCBS_REGIME_NORMAL_DESDE) {
      c.aviso('ibscbs_ausente_regime_normal', 'servico.ibsCbsCst', 'Cliente do regime normal (Lucro Presumido/Real) sem IBS/CBS na nota. Confira se o IBS/CBS já precisa ser informado e preencha o padrão na configuração fiscal (ex.: CST 000, classificação 000001, indicador 100301).')
    }
    return
  }
  if (cst.length !== 3 || cClassTrib.length !== 6 || cIndOp.length !== 6) {
    const campo: CampoFiscal = cst.length !== 3 ? 'servico.ibsCbsCst' : cClassTrib.length !== 6 ? 'servico.ibsCbsClassTrib' : 'servico.ibsCbsIndOp'
    c.bloqueio('ibscbs_incompleto', campo, 'IBS/CBS pela metade: informe CST, classificação tributária e indicador de operação (os três) ou deixe os três vazios.')
    return
  }
  if (r.competencia < INICIO_IBSCBS) {
    c.bloqueio('ibscbs_antes_2026', 'dataCompetencia', `IBS/CBS só pode ser informado a partir da competência 01/2026 (a nota é de ${mesAno(r.competencia)}). Remova o IBS/CBS ou corrija a competência.`, 'E0850')
  }
  if (r.regime === 'mei') {
    c.aviso('ibscbs_mei', 'servico.ibsCbsCst', 'MEI não precisa informar IBS/CBS em 2026. Se não houver orientação do contador, deixe os três campos vazios.')
  }

  // Indicador de operação
  if (/^02\d{4}$/.test(cIndOp)) {
    c.bloqueio('cindop_imovel', 'servico.ibsCbsIndOp', `O indicador de operação ${cIndOp} é de operação com bem imóvel e exige os dados do imóvel, que a plataforma ainda não envia. Para serviços em geral (consultoria, contabilidade, TI) use 100301 — corrija na nota e na configuração fiscal do cliente.`, 'E0932')
  } else if (!INDICADORES.has(cIndOp)) {
    c.bloqueio('cindop_inexistente', 'servico.ibsCbsIndOp', `O indicador de operação ${cIndOp} não existe na tabela oficial (Anexo VII). Escolha na lista — para serviços em geral, 100301.`, 'E0901')
  }

  // CST + classificação
  if (!CSTS.has(cst)) {
    c.bloqueio('cst_inexistente', 'servico.ibsCbsCst', `O CST ${cst} do IBS/CBS não é válido para NFS-e. Escolha na lista.`, 'E0958')
  } else if (!cClassTrib.startsWith(cst)) {
    c.bloqueio('cclasstrib_cst', 'servico.ibsCbsClassTrib', `A classificação tributária ${cClassTrib} não pertence ao CST ${cst} (os 3 primeiros dígitos precisam ser ${cst}).`, 'E0958')
  } else {
    const cl = CLASSIFICACOES.get(cClassTrib)
    if (!cl) {
      c.bloqueio('cclasstrib_inexistente', 'servico.ibsCbsClassTrib', `A classificação tributária ${cClassTrib} não é aceita em NFS-e (tabela oficial do IBS/CBS). Escolha na lista.`, 'E0958')
    } else if ((cl.inicio && cl.inicio > r.competencia) || (cl.fim && cl.fim < r.competencia)) {
      const vig = cl.fim ? `de ${dataBr(cl.inicio ?? '')} a ${dataBr(cl.fim)}` : `a partir de ${dataBr(cl.inicio ?? '')}`
      c.bloqueio('cclasstrib_vigencia', 'servico.ibsCbsClassTrib', `A classificação tributária ${cClassTrib} não está vigente na competência ${mesAno(r.competencia)} (vale ${vig}). Escolha outra classificação.`, 'E0958')
    } else if (cl.regular) {
      c.bloqueio('cclasstrib_trib_regular', 'servico.ibsCbsClassTrib', `A classificação ${cClassTrib} exige o grupo de tributação regular, que a plataforma ainda não envia. Escolha outra classificação ou emita pelo portal.`, 'E0965')
    }
  }

  // IBS/CBS exige NBS (E0322) — segunda nota de produção recusada (2026-11-06).
  if (!r.nbs) {
    c.bloqueio('ibscbs_sem_nbs', 'servico.codigoNbs', 'Com IBS/CBS informado, o código NBS é obrigatório. Escolha o NBS do serviço (busque pela descrição — ex.: "contabilidade") na nota ou na configuração fiscal do cliente.', 'E0322')
  }
  if (r.cTribNac && ITENS_EXIGEM_TPOPER.has(r.cTribNac.slice(0, 4))) {
    c.bloqueio('ibscbs_exige_tpoper', 'servico.ibsCbsCst', `Com IBS/CBS, o serviço ${r.cTribNac.slice(0, 2)}.${r.cTribNac.slice(2, 4)} exige o tipo de operação (tpOper), que a plataforma ainda não envia. Emita pelo portal ou sem IBS/CBS.`, 'E0903')
  }
}

// ─── Regras: alíquota, retenções, natureza ─────────────────────────────────

function regrasTributos(e: EntradaPreValidacao, r: Resolvido, c: Coletor, apenasConfig: boolean) {
  const s = (e.nota.servico ?? {}) as Partial<Servico>
  const { config } = e
  const a = r.aliquota

  if (a !== undefined && (a < 0 || a > 100)) {
    c.bloqueio('aliquota_faixa', 'servico.aliquota', 'Alíquota do ISS inválida.')
  } else if (a !== undefined && a > ALIQUOTA_ISS_MAXIMA) {
    c.bloqueio('aliquota_maxima', 'servico.aliquota', `Alíquota do ISS de ${a}% acima do teto de ${ALIQUOTA_ISS_MAXIMA}% (LC 116). Corrija a alíquota.`, 'E0595')
  } else if (a !== undefined && a > 0 && a < ALIQUOTA_ISS_MINIMA && r.regime === 'normal') {
    c.aviso('aliquota_minima', 'servico.aliquota', `Alíquota do ISS de ${a}% abaixo do piso de ${ALIQUOTA_ISS_MINIMA}% (LC 157). Confirme com a legislação do município.`)
  } else if (a === undefined && !apenasConfig && !r.nacional) {
    c.bloqueio('aliquota_ausente', 'servico.aliquota', 'Informe a alíquota do ISS (na nota ou como padrão na configuração fiscal).')
  }

  if (!r.nacional) return
  const natureza = texto(config.naturezaOperacao) || '1'
  if (!['1', '2', '4'].includes(natureza)) {
    c.bloqueio('natureza_nao_suportada', 'config.naturezaOperacao', 'Isenção e exigibilidade suspensa ainda não são suportadas na emissão pelo Ambiente Nacional. Ajuste a natureza da operação na configuração fiscal ou emita pelo portal.')
  }

  if (r.regime === 'simples') {
    const pSn = numero(config.aliquotaSimplesNacional) ?? a
    if (pSn === undefined || pSn < 0 || pSn >= 100) {
      c.bloqueio('aliquota_simples_ausente', 'config.aliquotaSimplesNacional', 'Para ME/EPP do Simples, informe a alíquota efetiva do Simples Nacional (ou a alíquota padrão) na configuração fiscal — ela vai no total aproximado de tributos.', 'E0712')
    }
  }

  if (apenasConfig) return

  if (r.issRetido) {
    if (r.regime === 'mei') {
      c.bloqueio('iss_retido_mei', 'servico.issRetido', 'MEI não pode ter ISS retido pelo tomador. Marque "ISS retido: Não".', 'E0583')
    }
    if (natureza === '4') {
      c.bloqueio('iss_retido_imune', 'servico.issRetido', 'Não há retenção de ISS em operação imune. Marque "ISS retido: Não" ou revise a natureza da operação.', 'E0580')
    }
    if (r.regime === 'simples' && (a === undefined || a <= 0)) {
      c.bloqueio('iss_retido_sem_aliquota', 'servico.aliquota', 'ISS retido de ME/EPP do Simples exige a alíquota do ISS (a do Anexo do Simples do prestador).', 'E0640')
    }
    if (soDigitos(e.nota.tomador?.cpfCnpj).length === 11) {
      c.aviso('iss_retido_pessoa_fisica', 'servico.issRetido', 'ISS retido com tomador pessoa física (CPF) é incomum — confirme se o tomador é mesmo responsável pelo recolhimento.')
    }
  }

  const federais = [s.valorIr, s.valorCsll, s.valorInss, s.valorPis, s.valorCofins]
  if (r.regime === 'mei' && federais.some(positivo)) {
    c.bloqueio('mei_tributos_federais', 'servico.retencoes', 'MEI não informa tributos federais nem retenções (IR, CSLL, INSS, PIS/COFINS) na NFS-e. Zere esses valores.', 'E0676')
  }
  if (positivo(s.valorPis) || positivo(s.valorCofins)) {
    c.bloqueio('piscofins_nao_suportado', 'servico.retencoes', 'PIS/COFINS na NFS-e nacional exige o CST da operação, que a plataforma ainda não coleta. Emita sem PIS/COFINS ou pelo portal.')
  }
  if (positivo(s.outrasRetencoes)) {
    c.bloqueio('outras_retencoes', 'servico.retencoes', '"Outras retenções" não existe no leiaute nacional. Remova o valor ou detalhe a retenção (IR, CSLL, INSS).')
  }
  const valor = numero(s.valorServico)
  if (valor !== undefined && valor > 0) {
    const codigos: Record<string, string> = { valorInss: 'E0699', valorIr: 'E0700', valorCsll: 'E0700' }
    for (const k of ['valorInss', 'valorIr', 'valorCsll'] as const) {
      const v = numero(s[k])
      if (v !== undefined && v >= valor && r.regime !== 'mei') {
        c.bloqueio(`retencao_${k}`, 'servico.retencoes', 'Retenção federal (IR, CSLL ou INSS) precisa ser menor que o valor do serviço.', codigos[k])
      }
    }
  }
}

// ─── Regras: tomador ────────────────────────────────────────────────────────

function enderecoCompleto(t: Partial<Tomador> | null | undefined): boolean {
  const en = t?.endereco
  return Boolean(en && soDigitos(en.cep).length === 8 && soDigitos(en.municipioIbge).length === 7
    && texto(en.logradouro) && texto(en.numero) && texto(en.bairro))
}

function regrasTomador(e: EntradaPreValidacao, c: Coletor) {
  const t = e.nota.tomador
  if (!t) {
    c.bloqueio('tomador_ausente', 'tomador.cpfCnpj', 'Informe o tomador do serviço (CPF/CNPJ e nome).')
    return
  }
  const doc = soDigitos(t.cpfCnpj)
  if (!cpfCnpjValido(doc)) {
    c.bloqueio('tomador_documento', 'tomador.cpfCnpj', 'CPF/CNPJ do tomador inválido — confira os dígitos.', doc.length === 11 ? 'E0206' : 'E0188')
  } else if (doc === soDigitos(e.prestador.cnpj)) {
    c.bloqueio('tomador_igual_prestador', 'tomador.cpfCnpj', 'O tomador não pode ser o próprio prestador (mesmo CNPJ). Informe o cliente que contratou o serviço.', 'E0202')
  }
  const nome = texto(t.razaoSocial)
  if (nome.length < 2 || nome.length > 200) {
    c.bloqueio('tomador_nome', 'tomador.razaoSocial', 'Nome/razão social do tomador obrigatório (2 a 200 caracteres).')
  }
  if (texto(t.email) && !emailValido(texto(t.email))) {
    c.bloqueio('tomador_email', 'tomador.email', 'E-mail do tomador inválido.', 'E0247')
  }

  const en = t.endereco
  if (en) {
    const cep = soDigitos(en.cep)
    const ibge = normalizarIbge(soDigitos(en.municipioIbge))
    const algum = Boolean(cep || ibge || texto(en.logradouro) || texto(en.numero) || texto(en.bairro))
    if (algum) {
      if (cep.length !== 8) c.bloqueio('tomador_cep', 'tomador.cep', 'CEP do tomador inválido: são 8 dígitos.', 'E0240')
      if (ibge && (ibge.length !== 7 || !municipioIbgeExiste(ibge))) {
        c.bloqueio('tomador_municipio', 'tomador.municipio', 'Município IBGE do tomador inexistente. Busque o endereço pelo CEP.', 'E0238')
      }
      if (!enderecoCompleto(t)) {
        c.bloqueio('tomador_endereco_parcial', 'tomador.endereco', 'Endereço do tomador incompleto: preencha CEP, logradouro, número, bairro e município (IBGE) — ou deixe o endereço todo vazio.', 'E1235')
      }
    }
  }
}

// ─── Regras: valores, textos, datas ────────────────────────────────────────

function regrasValores(e: EntradaPreValidacao, r: Resolvido, c: Coletor) {
  const s = (e.nota.servico ?? {}) as Partial<Servico>
  const valor = numero(s.valorServico)
  if (valor === undefined || valor <= 0) {
    c.bloqueio('valor_servico', 'servico.valorServico', 'O valor do serviço precisa ser maior que zero.')
  }
  const ded = numero(s.valorDeducoes)
  if (ded !== undefined && ded < 0) {
    c.bloqueio('deducoes_negativas', 'servico.valorDeducoes', 'Valor de deduções não pode ser negativo.')
  } else if (ded !== undefined && valor !== undefined && ded > valor) {
    c.bloqueio('deducoes_maior_valor', 'servico.valorDeducoes', 'Valor de deduções não pode ser maior que o valor do serviço.', 'E0427')
  } else if (r.nacional && positivo(ded)) {
    c.bloqueio('deducoes_nao_suportadas', 'servico.valorDeducoes', 'Deduções/reduções da base de cálculo ainda não são suportadas na emissão pelo Ambiente Nacional. Remova as deduções ou emita pelo portal.')
  }
  if (valor !== undefined && valor > 0) {
    if (positivo(s.descontoIncondicionado) && (s.descontoIncondicionado as number) >= valor) {
      c.bloqueio('desconto_incondicionado', 'servico.descontos', 'O desconto incondicionado precisa ser menor que o valor do serviço.', 'E0431')
    }
    if (positivo(s.descontoCondicionado) && (s.descontoCondicionado as number) >= valor) {
      c.bloqueio('desconto_condicionado', 'servico.descontos', 'O desconto condicionado precisa ser menor que o valor do serviço.', 'E0432')
    }
    const soma = (numero(s.descontoIncondicionado) ?? 0) + (numero(ded) ?? 0)
    if (soma > valor && !(ded !== undefined && ded > valor)) {
      c.bloqueio('descontos_deducoes', 'servico.descontos', 'Desconto incondicionado + deduções ultrapassam o valor do serviço.', 'E0427')
    }
  }

  const desc = texto(s.discriminacao)
  if (desc.length < 5 || desc.length > 2000) {
    c.bloqueio('discriminacao', 'servico.discriminacao', 'A descrição do serviço deve ter entre 5 e 2000 caracteres.')
  }
  if (!texto(s.codigoServico) && !texto(e.config.codigoServicoPadrao)) {
    c.bloqueio('codigo_servico', 'servico.codigoServico', 'Informe o código do serviço (ex.: 17.19).')
  }
  if (texto(s.informacoesComplementares).length > 2000) {
    c.bloqueio('informacoes_complementares', 'servico.informacoesComplementares', 'Informações complementares com até 2000 caracteres.')
  }
  if (s.issRetido !== undefined && typeof s.issRetido !== 'boolean') {
    c.bloqueio('iss_retido_tipo', 'servico.issRetido', 'Informe se o ISS é retido (sim ou não).')
  }
}

function regrasDatas(e: EntradaPreValidacao, r: Resolvido, c: Coletor) {
  const bruto = texto(e.nota.dataCompetencia)
  if (bruto && !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    c.bloqueio('competencia_formato', 'dataCompetencia', 'Data de competência inválida.')
    return
  }
  const mesComp = r.competencia.slice(0, 7)
  const mesHoje = e.hoje.slice(0, 7)
  if (mesComp > mesHoje) {
    c.bloqueio('competencia_futura', 'dataCompetencia', `A competência (${mesAno(r.competencia)}) não pode ser posterior ao mês atual: a Sefin recusa competência depois da emissão. Corrija o mês de competência.`, 'E0015')
  } else if (r.competencia < somarMeses(e.hoje, -12)) {
    c.aviso('competencia_antiga', 'dataCompetencia', `Competência de ${mesAno(r.competencia)}, mais de 12 meses atrás. Confirme o mês — nota retroativa pode ser recusada se for anterior ao convênio do município (E0016).`, 'E0016')
  }
}

// ─── Entradas públicas ─────────────────────────────────────────────────────

function semRepetir(achados: AchadoFiscal[]): AchadoFiscal[] {
  const vistos = new Set<string>()
  return achados.filter((a) => {
    const k = `${a.regra}|${a.mensagem}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** Pré-validação da NOTA (dados da nota + configuração + prestador + certificado). */
export function preValidarNfse(e: EntradaPreValidacao): AchadoFiscal[] {
  const c = new Coletor()
  const r = resolver(e, c, false)
  regrasPrestador(e, r, c, false)
  regrasTomador(e, c)
  regrasServico(e, r, c, false)
  regrasIbsCbs(r, c)
  regrasTributos(e, r, c, false)
  regrasValores(e, r, c)
  regrasDatas(e, r, c)
  return semRepetir(c.achados)
}

/**
 * Pré-validação dos PADRÕES da configuração fiscal (cIndOp, IBS/CBS, cTribNac,
 * NBS, alíquota, regime, município): o que geraria bloqueio em toda nota do
 * cliente. Usa a competência de hoje.
 */
export function preValidarConfigFiscal(
  config: EntradaPreValidacao['config'],
  hoje: string,
): AchadoFiscal[] {
  const e: EntradaPreValidacao = { nota: {}, config, prestador: { municipioIbge: config.municipioIbge }, hoje }
  const c = new Coletor()
  const r = resolver(e, c, true)
  regrasPrestador(e, r, c, true)
  regrasServico(e, r, c, true)
  regrasIbsCbs(r, c)
  regrasTributos(e, r, c, true)
  return semRepetir(c.achados)
}

export const bloqueiosDe = (achados: AchadoFiscal[]) => achados.filter((a) => a.severidade === 'bloqueio')
export const avisosDe = (achados: AchadoFiscal[]) => achados.filter((a) => a.severidade === 'aviso')

/** Texto único dos bloqueios (erro do servidor, lote, toast). */
export function textoBloqueios(achados: AchadoFiscal[]): string {
  return bloqueiosDe(achados)
    .map((a) => (a.codigoSefin ? `${a.mensagem} (evita ${a.codigoSefin})` : a.mensagem))
    .join(' | ')
}
