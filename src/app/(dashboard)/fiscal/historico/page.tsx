'use client'

import { useCallback, useMemo, useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp, type QueryConstraint } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'

import { listDocumentsPage, type FirestoreCursor } from '@/lib/firestore-client'
import { formatDate, formatCurrency , tsToDate } from '@/lib/utils'
import { exportToCsv } from '@/lib/export-csv'
import { exportToExcel } from '@/lib/export-excel'
import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableEmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Download, Eye, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida: { label: 'Emitida', variant: 'default' },
  pendente_processamento: { label: 'Pendente', variant: 'outline' },
  cancelamento_pendente: { label: 'Cancelamento pendente', variant: 'outline' },
  rejeitada: { label: 'Rejeitada', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'secondary' },
  erro_integracao: { label: 'Erro', variant: 'destructive' },
}

const PAGE_SIZE = 20

function FiscalHistoricoContent() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('clienteId') ?? ''
  const status = searchParams.get('status') ?? ''
  const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : undefined
  const ano = searchParams.get('ano') ? parseInt(searchParams.get('ano')!) : undefined

  const [notas, setNotas] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [lastCursor, setLastCursor] = useState<FirestoreCursor | null>(null)
  const filterKey = useMemo(
    () => JSON.stringify({ clienteId, status, mes, ano }),
    [ano, clienteId, mes, status]
  )
  const [pagination, setPagination] = useState<{
    filterKey: string
    page: number
    cursorStack: Array<FirestoreCursor | null>
  }>({ filterKey, page: 1, cursorStack: [null] })
  const activePagination = useMemo(
    () => pagination.filterKey === filterKey
      ? pagination
      : { filterKey, page: 1, cursorStack: [null] as Array<FirestoreCursor | null> },
    [filterKey, pagination]
  )
  const page = activePagination.page
  const [cancelamentoId, setCancelamentoId] = useState<string | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  const loadNotas = useCallback(() => {
    setLoading(true)
    const cursor = activePagination.cursorStack[page - 1] ?? null
    const hasDateWindow = Boolean(ano && (!mes || (mes >= 1 && mes <= 12)))
    const inicioPeriodo = hasDateWindow
      ? Timestamp.fromDate(new Date(ano!, mes ? mes - 1 : 0, 1))
      : null
    const fimPeriodo = hasDateWindow
      ? Timestamp.fromDate(new Date(ano!, mes ? mes : 12, 0, 23, 59, 59))
      : null

    const constraints: QueryConstraint[] = [
      ...(clienteId ? [where('clienteId', '==', clienteId)] : []),
      ...(status ? [where('status', '==', status)] : []),
      ...(inicioPeriodo && fimPeriodo
        ? [where('dataEmissao', '>=', inicioPeriodo), where('dataEmissao', '<=', fimPeriodo), orderBy('dataEmissao', 'desc')]
        : [orderBy('criadoEm', 'desc')]),
    ]
    listDocumentsPage<Record<string, unknown>>('nfse_emitidas', constraints, cursor, PAGE_SIZE + 1).then((data) => {
      let filtered = data.rows
      if ((mes || ano) && !hasDateWindow) {
        filtered = filtered.filter((n) => {
          const dataEmissao = n.dataEmissao as Timestamp | undefined
          if (!dataEmissao) return false
          const dt = tsToDate(dataEmissao)
          if (!dt) return false
          if (mes && dt.getMonth() + 1 !== mes) return false
          if (ano && dt.getFullYear() !== ano) return false
          return true
        })
      }
      const pageRows = filtered.slice(0, PAGE_SIZE)
      setNotas(pageRows)
      setHasMore(filtered.length > PAGE_SIZE)
      setLastCursor(filtered.length > PAGE_SIZE ? (data.cursors[PAGE_SIZE - 1] ?? null) : null)
    }).catch((err) => {
      toast.error(getErrorMessage(err, 'Nao foi possivel carregar o historico de NFS-e. Verifique os filtros e tente novamente.'))
      setNotas([])
      setHasMore(false)
      setLastCursor(null)
    }).finally(() => setLoading(false))
  }, [activePagination, ano, clienteId, mes, page, status])

  useEffect(() => {
    queueMicrotask(loadNotas)
  }, [loadNotas])

  function exportarCsv() {
    const rows = montarLinhasExportacao()
    exportToCsv(
      `historico-nfse-${ano ?? 'todos'}-${mes ?? 'todos'}`,
      rows,
      exportColumns
    )
  }

  const exportColumns = [
    { key: 'cliente', label: 'Cliente' },
    { key: 'numero', label: 'Numero NFS-e' },
    { key: 'tomador', label: 'Tomador' },
    { key: 'emissao', label: 'Emissao' },
    { key: 'valor', label: 'Valor' },
    { key: 'status', label: 'Status' },
  ]

  function montarLinhasExportacao() {
    return notas.map((n) => ({
      cliente: n.clienteNome,
      numero: n.numeroNfse,
      tomador: n.tomadorNome,
      emissao: n.dataEmissao ? formatDate(tsToDate(n.dataEmissao as Timestamp)) : '',
      valor: n.valorServico,
      status: n.status,
    }))
  }

  function exportarExcel() {
    exportToExcel(
      `historico-nfse-${ano ?? 'todos'}-${mes ?? 'todos'}`,
      montarLinhasExportacao(),
      exportColumns
    )
  }

  async function consultarStatus(nfseId: string) {
    try {
      const fn = httpsCallable<{ nfseId: string }, { status: string; message: string }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'consultarNfse'
      )
      const { data } = await fn({ nfseId })
      toast.success(data.message)
      loadNotas()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel consultar a NFS-e. Verifique a configuracao fiscal do cliente.'))
    }
  }

  function abrirCancelamento(nfseId: string) {
    setCancelamentoId(nfseId)
    setMotivoCancelamento('')
  }

  async function confirmarCancelamento() {
    if (!cancelamentoId) return
    const motivo = motivoCancelamento.trim()
    if (motivo.length < 10) {
      toast.error('Informe um motivo com pelo menos 10 caracteres.')
      return
    }
    setCancelando(true)
    try {
      const fn = httpsCallable<{ nfseId: string; motivo: string }, { status: string; message: string }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'cancelarNfse'
      )
      const { data } = await fn({ nfseId: cancelamentoId, motivo })
      toast.success(data.message)
      setCancelamentoId(null)
      setMotivoCancelamento('')
      loadNotas()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel solicitar o cancelamento. Verifique o status da nota e a configuracao fiscal.'))
    } finally {
      setCancelando(false)
    }
  }

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      ...(clienteId && { clienteId }),
      ...(status && { status }),
      ...(mes && { mes: String(mes) }),
      ...(ano && { ano: String(ano) }),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/fiscal/historico?${params.toString()}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  const total = notas.length
  const totalPages = hasMore ? page + 1 : page

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex flex-wrap items-center gap-3 border px-4 py-4 sm:px-5">
        <Link href="/fiscal">
          <Button variant="outline" size="sm" className="h-10 w-10 rounded-xl p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Histórico de NFS-e</h2>
          <p className="text-sm text-muted-foreground">
            {total} nota{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-9 rounded-xl" onClick={exportarExcel}>
          <Download className="h-4 w-4" />
          Excel
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={exportarCsv}>
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </div>

      <div className="surface-subtle flex flex-wrap items-center gap-2 border px-3 py-2.5">
        {['', 'emitida', 'pendente_processamento', 'cancelamento_pendente', 'rejeitada', 'cancelada', 'erro_integracao'].map(
          (s) => (
            <Link key={s} href={buildUrl({ status: s })}>
              <Button
                variant={status === s ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
              >
                {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
              </Button>
            </Link>
          )
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/65 bg-card/95 card-shadow">
        <table className="min-w-[920px] w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cliente</th>
              <th className="px-4 py-3 text-left font-medium">Nº NFS-e</th>
              <th className="px-4 py-3 text-left font-medium">Tomador</th>
              <th className="px-4 py-3 text-left font-medium">Emissão</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {notas.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={FileText}
                title="Nenhuma NFS-e encontrada"
                description={clienteId || status || mes || ano
                  ? 'Remova filtros para conferir se existem notas em outros períodos ou status.'
                  : 'Crie um rascunho revisado e emita em homologação antes de liberar produção.'}
                action={clienteId || status || mes || ano
                  ? { label: 'Limpar filtros', href: '/fiscal/historico' }
                  : { label: 'Emitir NFS-e', href: '/fiscal?emitir=1' }}
              />
            ) : (
              notas.map((n) => {
                const st = STATUS_MAP[n.status as string] ?? {
                  label: n.status as string,
                  variant: 'outline' as const,
                }
                const dataEmissao = n.dataEmissao as Timestamp | undefined
                return (
                  <tr key={n.id as string} className="transition-colors hover:bg-muted/35">
                    <td className="px-4 py-3 font-medium">{(n.clienteNome as string) ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(n.numeroNfse as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {(n.tomadorNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(n.valorServico as number)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/fiscal/${n.id as string}`}>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Ver detalhe">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Consultar status" onClick={() => consultarStatus(n.id as string)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        {n.pdfUrl ? (
                          <a href={n.pdfUrl as string} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Baixar PDF">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        ) : null}
                        {n.status === 'emitida' ? (
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive" title="Solicitar cancelamento" onClick={() => abrirCancelamento(n.id as string)}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="surface-subtle flex items-center justify-between border px-3 py-2.5 text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={() => {
                  setPagination({
                    ...activePagination,
                    page: Math.max(1, page - 1),
                  })
                }}
              >
                Anterior
              </Button>
            ) : null}
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={() => {
                  if (!lastCursor) return
                  setPagination((prev) => {
                    const base = prev.filterKey === filterKey ? prev : activePagination
                    return {
                      ...base,
                      page: page + 1,
                      cursorStack: base.cursorStack[page] ? base.cursorStack : [...base.cursorStack, lastCursor],
                    }
                  })
                }}
              >
                Próxima
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(cancelamentoId)} onOpenChange={(open) => !open && setCancelamentoId(null)}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Solicitar cancelamento</DialogTitle>
            <DialogDescription>
              A solicitação será registrada com auditoria e ficará pendente de processamento fiscal.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoCancelamento}
            onChange={(event) => setMotivoCancelamento(event.target.value)}
            placeholder="Informe o motivo fiscal do cancelamento"
            className="min-h-28"
          />
          <DialogFooter className="flex-row justify-end border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => setCancelamentoId(null)} disabled={cancelando}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarCancelamento} disabled={cancelando}>
              {cancelando ? 'Registrando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function FiscalHistoricoPage() {
  return (
    <Suspense fallback={<div className="space-y-3 py-6"><div className="h-9 w-56 bg-muted rounded-lg animate-pulse" /><div className="h-64 w-full bg-muted/80 rounded-xl animate-pulse" /></div>}>
      <FiscalHistoricoContent />
    </Suspense>
  )
}
