import { limit, orderBy, Timestamp, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { deleteDocument, listDocuments } from '@/lib/firestore-client'
import { getFirebaseApp } from '@/lib/firebase'
import type { FiscalReadiness, FiscalReadinessCliente, FiscalSnapshot, NotaFiscalRecord } from './types'

const MUNICIPIO_TIPO: Record<string, 'abrasf_a1' | 'geisweb_a1' | 'simpliss' | 'conam' | 'giap'> = {
  '3525904': 'abrasf_a1',
  '3509502': 'abrasf_a1',
  '3508900': 'abrasf_a1',
  '3550308': 'abrasf_a1',
  '3505708': 'abrasf_a1',
  '3547304': 'simpliss',
  '3552502': 'conam',
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

function getCredenciaisBloqueios(fiscal: Record<string, unknown>) {
  const credenciais = (fiscal.credenciais ?? {}) as Record<string, unknown>
  const municipioIbge = (fiscal.municipioIbge ?? fiscal.codigoMunicipioIbge) as string | undefined
  const tipo = municipioIbge ? MUNICIPIO_TIPO[municipioIbge] : undefined

  if (tipo === 'abrasf_a1' || tipo === 'geisweb_a1') {
    if (!hasText(credenciais.certificadoStoragePath) || credenciais.certValido !== true) {
      return ['certificado A1 ausente ou vencido']
    }
  }

  if (tipo === 'simpliss' && !hasText(credenciais.simplissToken)) return ['token Simpliss ausente']
  if (tipo === 'conam') {
    const missing = []
    if (!hasText(credenciais.conamCodigoUsuario)) missing.push('usuario Conam ausente')
    if (!hasText(credenciais.conamCodigoContribuinte)) missing.push('contribuinte Conam ausente')
    return missing
  }
  if (tipo === 'giap') {
    const missing = []
    if (!hasText(credenciais.giaplogin)) missing.push('login GIAP ausente')
    if (!hasText(credenciais.giapSenha)) missing.push('senha GIAP ausente')
    return missing
  }

  return []
}

export async function fetchFiscalSnapshot(): Promise<FiscalSnapshot> {
  const hoje = new Date()
  const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))

  const [emitidaMesR, pendenteR, erroR, canceladaR, recentesR, rascunhosR] = await Promise.allSettled([
    listDocuments('nfse_emitidas', [
      where('status', '==', 'emitida'),
      where('dataEmissao', '>=', inicioMes),
      where('dataEmissao', '<=', fimMes),
    ]),
    listDocuments('nfse_emitidas', [where('status', 'in', ['pendente_processamento', 'cancelamento_pendente'])]),
    listDocuments('nfse_emitidas', [where('status', 'in', ['erro_integracao', 'rejeitada'])]),
    listDocuments('nfse_emitidas', [
      where('status', '==', 'cancelada'),
      where('dataEmissao', '>=', inicioMes),
      where('dataEmissao', '<=', fimMes),
    ]),
    listDocuments('nfse_emitidas', [orderBy('criadoEm', 'desc'), limit(5)]),
    listDocuments('nfse_rascunhos', [where('status', 'in', ['rascunho', 'aguardando_emissao', 'erro_integracao']), limit(10)]),
  ])

  const emitidaMesData = emitidaMesR.status === 'fulfilled' ? emitidaMesR.value : []
  const pendenteData = pendenteR.status === 'fulfilled' ? pendenteR.value : []
  const erroData = erroR.status === 'fulfilled' ? erroR.value : []
  const canceladaData = canceladaR.status === 'fulfilled' ? canceladaR.value : []
  const recentesData = recentesR.status === 'fulfilled' ? recentesR.value : []
  const rascunhosData = rascunhosR.status === 'fulfilled' ? rascunhosR.value : []

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
    somaEmitidaMes: (emitidaMesData as NotaFiscalRecord[]).reduce((acc, d) => acc + (d.valorServico ?? 0), 0),
    pendenteCount: pendenteData.length + rascunhosData.length,
    erroCount: erroData.length,
    canceladaCount: canceladaData.length,
    notas: [...rascunhosNormalizados, ...(recentesData as NotaFiscalRecord[])].slice(0, 10),
  }
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

      if (servicosAtivos === 0) bloqueiosRascunho.push('sem servico ativo')
      if (!hasPositiveNumber(diaEmissao)) bloqueiosRascunho.push('dia de emissao NFS-e ausente')

      if (!fiscal) {
        bloqueiosRascunho.push('sem configuracao fiscal')
        bloqueiosEmissao.push('sem configuracao fiscal')
      } else {
        const municipioIbge = fiscal.municipioIbge ?? fiscal.codigoMunicipioIbge
        if (!hasText(municipioIbge)) bloqueiosRascunho.push('municipio emissor ausente')
        if (!hasText(fiscal.inscricaoMunicipal)) bloqueiosRascunho.push('inscricao municipal ausente')
        if (!hasText(fiscal.regimeTributario)) bloqueiosRascunho.push('regime tributario ausente')
        if (!hasText(fiscal.codigoServicoPadrao)) bloqueiosRascunho.push('codigo de servico padrao ausente')
        if (!hasText(fiscal.itemListaServico)) bloqueiosRascunho.push('item da lista de servico ausente')
        if (!hasText(fiscal.descricaoServicoPadrao)) bloqueiosRascunho.push('descricao padrao da NFS-e ausente')
        if (!hasPositiveNumber(fiscal.aliquotaPadrao)) bloqueiosRascunho.push('aliquota padrao ausente')
        bloqueiosEmissao.push(...getCredenciaisBloqueios(fiscal))
        if (fiscal.ambienteEmissao === 'producao' && fiscal.producaoLiberada !== true) {
          bloqueiosEmissao.push('municipio nao liberado para producao')
        }
      }

      const bloqueios = [...new Set([...bloqueiosRascunho, ...bloqueiosEmissao])]

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
      }
    })
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'))

  return {
    totalClientesAtivos: rows.length,
    prontosRascunho: rows.filter((row) => row.prontoRascunho).length,
    prontosEmissao: rows.filter((row) => row.prontoEmissao).length,
    bloqueados: rows.filter((row) => !row.prontoRascunho || !row.prontoEmissao).length,
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
