/**
 * Ponte do front para o motor ÚNICO de pré-validação fiscal
 * (functions/src/nfse/pre-validacao — o mesmo código que o servidor roda antes
 * de reservar o número da DPS). Aqui só o que é da tela: montar a entrada a
 * partir do formulário e distribuir os achados pelos campos.
 */
import {
  avisosDe, bloqueiosDe, formatarNbs, hojeBrasilia, nbsCorrelacionadas, preValidarConfigFiscal, preValidarNfse,
  type AchadoFiscal, type CampoFiscal, type EntradaPreValidacao,
} from '../../functions/src/nfse/pre-validacao'
import { normalizarRascunho } from '../../functions/src/nfse/normalizar-rascunho'

export {
  avisosDe, bloqueiosDe, formatarNbs, hojeBrasilia, nbsCorrelacionadas, preValidarConfigFiscal, preValidarNfse,
}
export type { AchadoFiscal, CampoFiscal, EntradaPreValidacao }

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** Campos do formulário de emissão (nfse-emissao-form) que recebem achados. */
export interface DadosNotaFormulario {
  competencia?: string | null // AAAA-MM
  tomadorNome?: string | null
  tomadorCpfCnpj?: string | null
  tomadorEmail?: string | null
  /** Endereço como o formulário monta (completo) ou os campos soltos. */
  tomadorEndereco?: Record<string, string | undefined> | null
  descricaoFinal?: string | null
  codigoServico?: string | null
  itemListaServico?: string | null
  codigoTributacaoNacional?: string | null
  codigoNbs?: string | null
  municipioPrestacaoIbge?: string | null
  ibsCbsCst?: string | null
  ibsCbsClassTrib?: string | null
  ibsCbsIndOp?: string | null
  valorServico?: number | null
  aliquota?: number | null
  issRetido?: boolean | null
  informacoesComplementares?: string | null
}

/**
 * Entrada do motor a partir do formulário — mesma forma do payload que a tela
 * envia ao `emitirNfse` (vazio = herda da configuração fiscal).
 */
export function entradaDoFormulario(
  d: DadosNotaFormulario,
  fiscal: Record<string, unknown>,
  cliente: { cpfCnpj?: string; razaoSocial?: string } | undefined,
  hoje: string = hojeBrasilia(),
): EntradaPreValidacao {
  const comp = /^\d{4}-\d{2}$/.test(String(d.competencia ?? '')) ? `${d.competencia}-01` : undefined
  const e = d.tomadorEndereco ?? undefined
  const temEndereco = e && Object.values(e).some((v) => typeof v === 'string' && v.trim())
  return {
    hoje,
    config: fiscal as EntradaPreValidacao['config'],
    prestador: {
      cnpj: dig(cliente?.cpfCnpj),
      razaoSocial: cliente?.razaoSocial ?? '',
      inscricaoMunicipal: txt(fiscal.inscricaoMunicipal) ?? '',
      municipioIbge: txt(fiscal.municipioIbge) ?? txt(fiscal.codigoMunicipioIbge) ?? '',
    },
    nota: {
      dataCompetencia: comp,
      tomador: {
        razaoSocial: d.tomadorNome ?? '',
        cpfCnpj: dig(d.tomadorCpfCnpj),
        email: txt(d.tomadorEmail),
        endereco: temEndereco ? {
          cep: txt(e!.cep), logradouro: txt(e!.logradouro), numero: txt(e!.numero), complemento: txt(e!.complemento),
          bairro: txt(e!.bairro), municipioIbge: txt(e!.municipioIbge), uf: txt(e!.uf),
        } : undefined,
      },
      servico: {
        discriminacao: d.descricaoFinal ?? '',
        codigoServico: d.codigoServico ?? '',
        itemListaServico: txt(d.itemListaServico),
        codigoTributacaoNacional: txt(d.codigoTributacaoNacional),
        codigoNbs: txt(d.codigoNbs),
        municipioPrestacao: txt(d.municipioPrestacaoIbge),
        ibsCbsCst: txt(d.ibsCbsCst),
        ibsCbsClassTrib: txt(d.ibsCbsClassTrib),
        ibsCbsIndOp: txt(d.ibsCbsIndOp),
        informacoesComplementares: txt(d.informacoesComplementares),
        valorServico: num(d.valorServico) ?? 0,
        aliquota: num(d.aliquota),
        issRetido: d.issRetido === true,
      },
    },
  }
}

/** Campo lógico do motor → campo(s) do formulário de emissão onde a mensagem aparece. */
export const CAMPO_FORMULARIO_EMISSAO: Partial<Record<CampoFiscal, string>> = {
  'tomador.cpfCnpj': 'tomadorCpfCnpj',
  'tomador.razaoSocial': 'tomadorNome',
  'tomador.email': 'tomadorEmail',
  'tomador.endereco': 'tomadorCep',
  'tomador.cep': 'tomadorCep',
  'tomador.municipio': 'tomadorMunicipioIbge',
  'servico.discriminacao': 'descricaoServico',
  'servico.codigoServico': 'codigoServico',
  'servico.itemListaServico': 'itemListaServico',
  'servico.codigoTributacaoNacional': 'codigoTributacaoNacional',
  'servico.codigoNbs': 'codigoNbs',
  'servico.municipioPrestacao': 'municipioPrestacaoIbge',
  'servico.valorServico': 'valorServico',
  'servico.aliquota': 'aliquota',
  'servico.issRetido': 'issRetido',
  'servico.informacoesComplementares': 'informacoesComplementares',
  'servico.ibsCbsCst': 'ibsCbsCst',
  'servico.ibsCbsClassTrib': 'ibsCbsClassTrib',
  'servico.ibsCbsIndOp': 'ibsCbsIndOp',
  dataCompetencia: 'competencia',
}

/** Campo lógico do motor → campo do formulário de configuração fiscal. */
export const CAMPO_FORMULARIO_CONFIG: Partial<Record<CampoFiscal, string>> = {
  'prestador.municipio': 'municipioIbge',
  'prestador.inscricaoMunicipal': 'inscricaoMunicipal',
  'config.regime': 'regimeTributario',
  'config.naturezaOperacao': 'naturezaOperacao',
  'config.aliquotaSimplesNacional': 'aliquotaSimplesNacional',
  'config.ambiente': 'ambienteEmissao',
  'servico.itemListaServico': 'itemListaServico',
  'servico.codigoTributacaoNacional': 'codigoTributacaoNacional',
  'servico.codigoNbs': 'codigoNbs',
  'servico.aliquota': 'aliquotaPadrao',
  'servico.ibsCbsCst': 'ibsCbsCst',
  'servico.ibsCbsClassTrib': 'ibsCbsClassTrib',
  'servico.ibsCbsIndOp': 'ibsCbsIndOp',
}

/** Achados que caem num campo do formulário (pelo mapa dado). */
export function achadosDoCampo(achados: AchadoFiscal[], mapa: Partial<Record<CampoFiscal, string>>, campoFormulario: string): AchadoFiscal[] {
  return achados.filter((a) => mapa[a.campo] === campoFormulario)
}

/**
 * Na configuração fiscal, o município fora do Emissor Nacional não impede
 * SALVAR (o cliente pode precisar do cadastro para outras rotinas) — impede
 * emitir, e o painel diz isso. Os demais bloqueios dos padrões impedem salvar.
 */
export function bloqueiamSalvarConfig(achados: AchadoFiscal[]): AchadoFiscal[] {
  return bloqueiosDe(achados).filter((a) => a.campo !== 'prestador.municipio')
}

/** NBS sugeridas para o código de tributação (tabela oficial de correlação, Anexo VIII). */
export function nbsSugeridas(cTribNac: string | null | undefined): string[] {
  return nbsCorrelacionadas(cTribNac)?.map(formatarNbs) ?? []
}

/**
 * Pré-validação de um rascunho salvo (lote, lista): lê pelo MESMO normalizador
 * que o servidor usa para emitir o rascunho, então o resultado bate com o que
 * o servidor vai recusar.
 */
export function preValidarRascunho(
  rascunho: { id: string; clienteId: string; competenciaId?: string | null; dados?: Record<string, unknown> },
  fiscal: Record<string, unknown>,
  cliente: { cpfCnpj?: string; razaoSocial?: string } | undefined,
  hoje: string = hojeBrasilia(),
): AchadoFiscal[] {
  const input = normalizarRascunho(rascunho.id, { clienteId: rascunho.clienteId, competenciaId: rascunho.competenciaId ?? null, dados: rascunho.dados ?? {} })
  return preValidarNfse({
    hoje,
    config: fiscal as EntradaPreValidacao['config'],
    prestador: {
      cnpj: dig(cliente?.cpfCnpj),
      razaoSocial: cliente?.razaoSocial ?? '',
      inscricaoMunicipal: txt(fiscal.inscricaoMunicipal) ?? '',
      municipioIbge: txt(fiscal.municipioIbge) ?? '',
    },
    nota: { tomador: input.tomador, servico: input.servico, dataCompetencia: input.dataCompetencia },
  })
}
