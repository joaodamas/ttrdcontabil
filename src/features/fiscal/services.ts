import { limit, orderBy, Timestamp, where } from 'firebase/firestore'
import { deleteDocument, listDocuments } from '@/lib/firestore-client'
import type { FiscalSnapshot, NotaFiscalRecord } from './types'

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
    listDocuments('nfse_emitidas', [where('status', '==', 'pendente_processamento')]),
    listDocuments('nfse_emitidas', [where('status', 'in', ['erro_integracao', 'rejeitada'])]),
    listDocuments('nfse_emitidas', [
      where('status', '==', 'cancelada'),
      where('dataEmissao', '>=', inicioMes),
      where('dataEmissao', '<=', fimMes),
    ]),
    listDocuments('nfse_emitidas', [orderBy('criadoEm', 'desc'), limit(5)]),
    listDocuments('nfse_rascunhos', [where('status', '==', 'aguardando_emissao'), limit(10)]),
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
      status: 'aguardando_emissao',
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
