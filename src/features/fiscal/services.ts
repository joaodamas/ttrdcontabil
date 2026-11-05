import { limit, orderBy, Timestamp, where } from 'firebase/firestore'
import { BLOQUEIO_FISCAL } from '@/lib/fiscal-bloqueios'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { deleteDocument, listDocuments } from '@/lib/firestore-client'
import { getFirebaseApp } from '@/lib/firebase'
import type { FiscalReadiness, FiscalReadinessCliente, FiscalSnapshot, NotaFiscalRecord } from './types'
import { normalizarIbge } from '@/lib/ibge'
import { situacaoNacional } from '@/lib/nfse-nacional-convenio'

const MUNICIPIO_TIPO: Record<string, 'abrasf_a1' | 'geisweb_a1' | 'simpliss' | 'conam' | 'giap'> = {
  '3525904': 'abrasf_a1',
  '3509502': 'abrasf_a1',
  '3509205': 'abrasf_a1',
  '3550308': 'abrasf_a1',
  '3505708': 'abrasf_a1',
  '3547304': 'simpliss',
  '3552809': 'conam',
  '3513009': 'giap',
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function getFiscalDocForCliente(
  fiscais: Array<Record<string, unknown> & { id: string }>,
  clienteId: string
) {
  return fiscais.find((f) => f.clienteId === clienteId && f.ativo !== false) ?? null
}

/**
 * Provedor efetivo — mesma regra do backend (functions/src/nfse/provedor.ts):
 * só 'prefeitura' (escolha explícita) usa o conector municipal; 'municipio'
 * gravado pelo formulário antigo e config sem o campo vão pelo Ambiente Nacional.
 */
export function provedorNfseEfetivo(fiscal: Record<string, unknown> | null | undefined): 'nacional' | 'municipio' {
  const p = fiscal?.provedorNfse
  return p === 'prefeitura' ? 'municipio' : 'nacional'
}

function temCertificadoA1Valido(credenciais: Record<string, unknown>) {
  return hasText(credenciais.certificadoStoragePath) && credenciais.certValido === true
}

export function getCredenciaisBloqueios(fiscal: Record<string, unknown>) {
  const credenciais = (fiscal.credenciais ?? {}) as Record<string, unknown>
  const provedor = provedorNfseEfetivo(fiscal)
  // Ambiente Nacional: a única credencial é o A1 do próprio cliente (mTLS + assinatura).
  if (provedor === 'nacional') return temCertificadoA1Valido(credenciais) ? [] : [BLOQUEIO_FISCAL.certificadoA1]
  const municipioIbge = (fiscal.municipioIbge ?? fiscal.codigoMunicipioIbge) as string | undefined
  const tipo = municipioIbge ? MUNICIPIO_TIPO[normalizarIbge(municipioIbge)] : undefined

  if (tipo === 'abrasf_a1' || tipo === 'geisweb_a1') {
    if (!temCertificadoA1Valido(credenciais)) return [BLOQUEIO_FISCAL.certificadoA1]
  }

  if (tipo === 'simpliss' && !hasText(credenciais.simplissToken)) return [BLOQUEIO_FISCAL.tokenSimpliss]
  if (tipo === 'conam') {
    const missing = []
    if (!hasText(credenciais.conamCodigoUsuario)) missing.push(BLOQUEIO_FISCAL.usuarioConam)
    if (!hasText(credenciais.conamCodigoContribuinte)) missing.push(BLOQUEIO_FISCAL.contribuinteConam)
    return missing
  }
  if (tipo === 'giap') {
    const missing = []
    if (!hasText(credenciais.giaplogin)) missing.push(BLOQUEIO_FISCAL.loginGiap)
    if (!hasText(credenciais.giapSenha)) missing.push(BLOQUEIO_FISCAL.senhaGiap)
    return missing
  }

  return []
}

function isNfe(doc: Record<string, unknown>): boolean {
  return doc.tipoDocumento === 'nfe'
}

function valorDocumento(doc: Record<string, unknown>): number {
  return Number((doc.valorServico as number | undefined) ?? (doc.valorTotal as number | undefined) ?? 0)
}

async function fetchFiscalSnapshotByTipo(tipo: 'nfse' | 'nfe'): Promise<FiscalSnapshot> {
  const hoje = new Date()
  const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))
  // tipoDocumento não tem índice composto dedicado — filtrado no cliente sobre
  // um lote maior, em vez de arriscar um FAILED_PRECONDITION em produção.
  const matchesTipo = (doc: Record<string, unknown>) => (tipo === 'nfe' ? isNfe(doc) : !isNfe(doc))

  const [emitidaMesR, pendenteR, erroR, canceladaR, recentesR, rascunhosR] = await Promise.allSettled([
    listDocuments('nfse_emitidas', [
      where('status', '==', 'emitida'),
      where('dataEmissao', '>=', inicioMes),
      where('dataEmissao', '<=', fimMes),
    ]),
    listDocuments('nfse_emitidas', [where('status', 'in', ['pendente_processamento', 'cancelamento_pendente']), limit(200)]),
    listDocuments('nfse_emitidas', [where('status', 'in', ['erro_integracao', 'rejeitada']), limit(200)]),
    listDocuments('nfse_emitidas', [
      where('status', '==', 'cancelada'),
      where('dataEmissao', '>=', inicioMes),
      where('dataEmissao', '<=', fimMes),
    ]),
    listDocuments('nfse_emitidas', [orderBy('criadoEm', 'desc'), limit(tipo === 'nfe' ? 30 : 5)]),
    listDocuments('nfse_rascunhos', [where('status', 'in', ['rascunho', 'aguardando_emissao', 'erro_integracao']), limit(30)]),
  ])

  const emitidaMesData = (emitidaMesR.status === 'fulfilled' ? emitidaMesR.value : []).filter(matchesTipo)
  const pendenteData = (pendenteR.status === 'fulfilled' ? pendenteR.value : []).filter(matchesTipo)
  const erroData = (erroR.status === 'fulfilled' ? erroR.value : []).filter(matchesTipo)
  const canceladaData = (canceladaR.status === 'fulfilled' ? canceladaR.value : []).filter(matchesTipo)
  const recentesData = (recentesR.status === 'fulfilled' ? recentesR.value : []).filter(matchesTipo)
  const rascunhosData = tipo === 'nfe' ? [] : (rascunhosR.status === 'fulfilled' ? rascunhosR.value : [])

  const rascunhosNormalizados = (rascunhosData as NotaFiscalRecord[]).map((r) => {
    const dados = (r.dados ?? {}) as Record<string, unknown>
    return {
      ...r,
      clienteNome: (r.clienteNome as string | undefined) ?? (r.titulo as string | undefined),
      valorServico: (dados.valorServico as number | undefined) ?? r.valorServico ?? 0,
      status: r.status ?? 'aguardando_emissao',
      _origem: 'rascunho' as const,
    }
  })

  return {
    emitidaMesCount: emitidaMesData.length,
    somaEmitidaMes: (emitidaMesData as Record<string, unknown>[]).reduce((acc, d) => acc + valorDocumento(d), 0),
    pendenteCount: pendenteData.length + rascunhosData.length,
    erroCount: erroData.length,
    canceladaCount: canceladaData.length,
    notas: [...rascunhosNormalizados, ...(recentesData as NotaFiscalRecord[])].slice(0, tipo === 'nfe' ? 10 : 10),
  }
}

export async function fetchFiscalSnapshot(): Promise<FiscalSnapshot> {
  return fetchFiscalSnapshotByTipo('nfse')
}

export async function fetchFiscalSnapshotNfe(): Promise<FiscalSnapshot> {
  return fetchFiscalSnapshotByTipo('nfe')
}

export async function removeRascunho(id: string) {
  await deleteDocument('nfse_rascunhos', id)
}

export async function fetchFiscalReadiness(): Promise<FiscalReadiness> {
  const [clientes, clientesServicos, fiscais] = await Promise.all([
    listDocuments<Record<string, unknown>>('clientes', [where('status', '==', 'ativo'), limit(500)]),
    listDocuments<Record<string, unknown>>('clientes_servicos', [limit(1000)]),
    listDocuments<Record<string, unknown>>('clientes_fiscal', [limit(500)]),
  ])

  const servicosPorCliente = new Map<string, Array<Record<string, unknown>>>()
  for (const servico of clientesServicos) {
    const clienteId = servico.clienteId as string | undefined
    if (!clienteId) continue
    const list = servicosPorCliente.get(clienteId) ?? []
    list.push(servico)
    servicosPorCliente.set(clienteId, list)
  }

  const rows: FiscalReadinessCliente[] = clientes
    .filter((cliente) => !cliente.deletedAt)
    .map((cliente) => {
      const clienteId = cliente.id
      const fiscal = getFiscalDocForCliente(fiscais, clienteId)
      const servicosAtivos = (servicosPorCliente.get(clienteId) ?? []).filter((servico) => {
        return servico.status === 'ativo' || servico.ativo === true || servico.status == null
      }).length

      const bloqueiosRascunho: string[] = []
      const bloqueiosEmissao: string[] = []
      const diaEmissao = cliente.diaEmissaoNFSe

      if (servicosAtivos === 0) bloqueiosRascunho.push(BLOQUEIO_FISCAL.semServicoAtivo)
      if (!hasPositiveNumber(diaEmissao)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.diaEmissaoAusente)

      if (!fiscal) {
        bloqueiosRascunho.push(BLOQUEIO_FISCAL.semConfiguracaoFiscal)
        bloqueiosEmissao.push(BLOQUEIO_FISCAL.semConfiguracaoFiscal)
      } else {
        const municipioIbge = fiscal.municipioIbge ?? fiscal.codigoMunicipioIbge
        if (!hasText(municipioIbge)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.municipioAusente)
        if (!hasText(fiscal.inscricaoMunicipal)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.inscricaoMunicipalAusente)
        if (!hasText(fiscal.regimeTributario)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.regimeAusente)
        if (!hasText(fiscal.codigoServicoPadrao)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.codigoServicoAusente)
        if (!hasText(fiscal.itemListaServico)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.itemListaAusente)
        if (!hasText(fiscal.descricaoServicoPadrao)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.descricaoAusente)
        if (!hasPositiveNumber(fiscal.aliquotaPadrao)) bloqueiosRascunho.push(BLOQUEIO_FISCAL.aliquotaAusente)
        bloqueiosEmissao.push(...getCredenciaisBloqueios(fiscal))
        if (provedorNfseEfetivo(fiscal) === 'nacional') {
          // Liberação de produção do Nacional é a chave única do escritório (não
          // por cliente); aqui só o que é do cliente: o município emitir pelo Nacional.
          const situacao = situacaoNacional(municipioIbge as string | undefined)
          if (situacao === 'prefeitura' || situacao === 'sem_convenio') bloqueiosEmissao.push(BLOQUEIO_FISCAL.municipioNaoEmiteNacional)
        } else if (fiscal.ambienteEmissao === 'producao' && fiscal.producaoLiberada !== true) {
          bloqueiosEmissao.push(BLOQUEIO_FISCAL.producaoNaoLiberada)
        }
      }

      // Provedor descontinuado primeiro: é o que trava tudo e some no "+N" do fim.
      const bloqueios = [...new Set([...bloqueiosRascunho, ...bloqueiosEmissao])]
        .sort((x, y) => Number(y === BLOQUEIO_FISCAL.provedorDescontinuado) - Number(x === BLOQUEIO_FISCAL.provedorDescontinuado))

      return {
        clienteId,
        clienteNome: (cliente.razaoSocial as string | undefined) ?? (cliente.nomeFantasia as string | undefined) ?? 'Cliente sem nome',
        cpfCnpj: cliente.cpfCnpj as string | undefined,
        municipio: fiscal ? ((fiscal.municipioEmissor as string | undefined) ?? (cliente.cidade as string | undefined)) : (cliente.cidade as string | undefined),
        diaEmissaoNFSe: hasPositiveNumber(diaEmissao) ? diaEmissao as number : undefined,
        servicosAtivos,
        bloqueios,
        prontoRascunho: bloqueiosRascunho.length === 0,
        prontoEmissao: bloqueiosRascunho.length === 0 && bloqueiosEmissao.length === 0,
        emissaoAutomatica: fiscal?.emissaoAutomatica === true,
      }
    })
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'))

  return {
    totalClientesAtivos: rows.length,
    prontosRascunho: rows.filter((row) => row.prontoRascunho).length,
    prontosEmissao: rows.filter((row) => row.prontoEmissao).length,
    bloqueados: rows.filter((row) => !row.prontoRascunho || !row.prontoEmissao).length,
    emissaoAutomaticaCount: rows.filter((row) => row.emissaoAutomatica).length,
    clientes: rows,
  }
}

export async function gerarRascunhosNfseMensais(params: { mes: number; ano: number; gerarAteHoje?: boolean }) {
  const fn = httpsCallable<
    { mes: number; ano: number; gerarAteHoje?: boolean },
    { criados: number; ignorados: number; pendentesRevisao: number; motivos: string[] }
  >(getFunctions(getFirebaseApp(), 'southamerica-east1'), 'gerarRascunhosNfseMensais')
  const { data } = await fn(params)
  return data
}
