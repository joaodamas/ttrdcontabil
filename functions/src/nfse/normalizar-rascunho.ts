/**
 * Normalizador ÚNICO rascunho → EmitirNfseInput (e o caminho de volta).
 *
 * Toda emissão passa por aqui — formulário (o servidor grava o payload no
 * rascunho e relê por esta função), lote, cron de recorrência, retry e a
 * reconciliação. Antes cada caminho montava o input à mão e esquecia campos
 * diferentes (cTribNac, NBS, IBS/CBS, local da prestação, informações
 * complementares, competência): a mesma nota saía diferente conforme o botão.
 *
 * PURO (sem firebase-admin): testado no vitest.
 */
import type { EmitirNfseInput } from './types'

type Texto = string | null | undefined

function txt(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

function digitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function numeroOuUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

type Endereco = NonNullable<EmitirNfseInput['tomador']['endereco']>
const CAMPOS_ENDERECO: (keyof Endereco)[] = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipioIbge', 'uf']

/** Endereço sem campos vazios; nada preenchido = undefined. */
function lerEndereco(raw: unknown): Endereco | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const e: Endereco = {}
  for (const campo of CAMPOS_ENDERECO) {
    const v = txt(r[campo])
    if (v) e[campo] = v
  }
  return Object.keys(e).length > 0 ? e : undefined
}

/**
 * Achata um documento de `nfse_rascunhos` no payload de emissão, cobrindo os
 * dois formatos que a coleção tem: o atual (campos soltos em `dados`, gravado
 * pelo formulário, pelo cron e pelo servidor) e o antigo (`dados.tomador` /
 * `dados.servico` aninhados). Nos dois formatos TODOS os campos da nota são
 * lidos.
 */
export function normalizarRascunho(id: string, data: Record<string, unknown>): EmitirNfseInput {
  const dados = (data.dados ?? {}) as Record<string, unknown>
  const tomadorRaw = (dados.tomador ?? null) as Record<string, unknown> | null
  const servicoRaw = (dados.servico ?? null) as Record<string, unknown> | null

  // Campo a campo: o aninhado (formato antigo) tem precedência quando existe;
  // o plano cobre o resto.
  const t = (aninhado: string, plano: string): unknown => tomadorRaw?.[aninhado] ?? dados[plano]
  const s = (aninhado: string, plano: string = aninhado): unknown => servicoRaw?.[aninhado] ?? dados[plano]

  const endereco = lerEndereco(tomadorRaw?.endereco ?? dados.tomadorEndereco)

  const input: EmitirNfseInput = {
    clienteId: data.clienteId as string,
    rascunhoId: id,
    competenciaId: txt(data.competenciaId) ?? txt(dados.competenciaId),
    tomador: {
      razaoSocial: String(t('razaoSocial', 'tomadorNome') ?? '').trim(),
      cpfCnpj: digitos(t('cpfCnpj', 'tomadorCpfCnpj')),
      email: txt(t('email', 'tomadorEmail')),
      ...(endereco ? { endereco } : {}),
    },
    servico: {
      discriminacao: String(s('discriminacao', 'descricaoServico') ?? ''),
      codigoServico: String(s('codigoServico') ?? ''),
      itemListaServico: txt(s('itemListaServico')),
      cnae: txt(s('cnae')),
      valorServico: Number(s('valorServico') ?? 0),
      aliquota: numeroOuUndefined(s('aliquota')),
      issRetido: Boolean(s('issRetido')),
      valorDeducoes: numeroOuUndefined(s('valorDeducoes')),
      codigoTributacaoNacional: txt(s('codigoTributacaoNacional')),
      codigoNbs: txt(s('codigoNbs')),
      municipioPrestacao: txt(s('municipioPrestacao', 'municipioPrestacaoIbge')),
      informacoesComplementares: txt(s('informacoesComplementares')),
      ibsCbsCst: txt(s('ibsCbsCst')),
      ibsCbsClassTrib: txt(s('ibsCbsClassTrib')),
      ibsCbsIndOp: txt(s('ibsCbsIndOp')),
      descricaoModelo: txt(s('descricaoModelo', 'descricaoServicoModelo')),
    },
    dataCompetencia: txt(dados.dataCompetencia),
    numeroRps: txt(dados.numeroRps),
    serieRps: txt(dados.serieRps),
  }
  // Sem `undefined` solto no objeto final (o Firestore recusa e o JSON some com eles).
  return removerIndefinidos(input)
}

function removerIndefinidos<T>(obj: T): T {
  if (Array.isArray(obj) || obj === null || typeof obj !== 'object') return obj
  const saida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue
    saida[k] = v && typeof v === 'object' && !Array.isArray(v) ? removerIndefinidos(v) : v
  }
  return saida as T
}

function nulo(v: Texto): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/**
 * Caminho de volta: o payload recebido do formulário vira o `dados` (formato
 * plano) do rascunho que o servidor grava ANTES de enviar. Sem `undefined`
 * (Firestore) — ausente vira null. `normalizarRascunho(dadosRascunhoDoInput(x))`
 * devolve a mesma nota (teste de ida e volta).
 */
export function dadosRascunhoDoInput(input: EmitirNfseInput): Record<string, unknown> {
  const tom = input.tomador
  const srv = input.servico
  const endereco = lerEndereco(tom?.endereco)
  return {
    tomadorNome: String(tom?.razaoSocial ?? '').trim(),
    tomadorCpfCnpj: digitos(tom?.cpfCnpj),
    tomadorEmail: nulo(tom?.email),
    tomadorEndereco: endereco ?? null,
    descricaoServico: String(srv?.discriminacao ?? ''),
    descricaoServicoModelo: nulo(srv?.descricaoModelo),
    codigoServico: String(srv?.codigoServico ?? ''),
    itemListaServico: nulo(srv?.itemListaServico),
    cnae: nulo(srv?.cnae),
    codigoTributacaoNacional: nulo(srv?.codigoTributacaoNacional),
    codigoNbs: nulo(srv?.codigoNbs),
    municipioPrestacaoIbge: nulo(srv?.municipioPrestacao),
    ibsCbsCst: nulo(srv?.ibsCbsCst),
    ibsCbsClassTrib: nulo(srv?.ibsCbsClassTrib),
    ibsCbsIndOp: nulo(srv?.ibsCbsIndOp),
    informacoesComplementares: nulo(srv?.informacoesComplementares),
    dataCompetencia: nulo(input.dataCompetencia),
    valorServico: Number(srv?.valorServico ?? 0),
    valorDeducoes: srv?.valorDeducoes ?? null,
    aliquota: srv?.aliquota ?? null,
    issRetido: Boolean(srv?.issRetido),
  }
}
