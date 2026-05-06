'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { orderBy, Timestamp, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { ArrowLeft, Download, Loader2, RefreshCw, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { getDocument, listDocuments } from '@/lib/firestore-client'
import { getFirebaseApp } from '@/lib/firebase'
import { formatCurrency, formatDate, tsToDate } from '@/lib/utils'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida: { label: 'Emitida', variant: 'default' },
  pendente_processamento: { label: 'Pendente', variant: 'outline' },
  cancelamento_pendente: { label: 'Cancelamento pendente', variant: 'outline' },
  rejeitada: { label: 'Rejeitada', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'secondary' },
  erro_integracao: { label: 'Erro', variant: 'destructive' },
}

export default function NfseDetalhePage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [nota, setNota] = useState<Record<string, unknown> | null>(null)
  const [eventos, setEventos] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [cancelamentoOpen, setCancelamentoOpen] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [notaData, eventosData] = await Promise.all([
        getDocument<Record<string, unknown>>('nfse_emitidas', id),
        listDocuments<Record<string, unknown>>('nfse_eventos', [
          where('nfseId', '==', id),
          orderBy('criadoEm', 'desc'),
        ]).catch(() => []),
      ])
      setNota(notaData)
      setEventos(eventosData)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function consultarStatus() {
    try {
      const fn = httpsCallable<{ nfseId: string }, { message: string }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'consultarNfse'
      )
      const { data } = await fn({ nfseId: id })
      toast.success(data.message)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao consultar NFS-e.')
    }
  }

  async function solicitarCancelamento() {
    const motivo = motivoCancelamento.trim()
    if (motivo.length < 10) {
      toast.error('Informe um motivo com pelo menos 10 caracteres.')
      return
    }
    setCancelando(true)
    try {
      const fn = httpsCallable<{ nfseId: string; motivo: string }, { message: string }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'cancelarNfse'
      )
      const { data } = await fn({ nfseId: id, motivo })
      toast.success(data.message)
      setCancelamentoOpen(false)
      setMotivoCancelamento('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar NFS-e.')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!nota) {
    return (
      <div className="space-y-4">
        <Link href="/fiscal/historico"><Button variant="outline">Voltar</Button></Link>
        <p className="text-sm text-muted-foreground">NFS-e não encontrada.</p>
      </div>
    )
  }

  const st = STATUS_MAP[nota.status as string] ?? { label: String(nota.status ?? '—'), variant: 'outline' as const }
  const dataEmissao = nota.dataEmissao as Timestamp | undefined

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex flex-wrap items-center gap-3 border px-4 py-4 sm:px-5">
        <Link href="/fiscal/historico">
          <Button variant="outline" size="sm" className="h-10 w-10 rounded-xl p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-lg font-semibold">NFS-e {(nota.numeroNfse as string) ?? 'sem número'}</h2>
          <p className="text-sm text-muted-foreground">{(nota.clienteNome as string) ?? 'Cliente não informado'}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={consultarStatus}>
            <RefreshCw className="h-4 w-4" />
            Consultar
          </Button>
          {nota.pdfUrl ? (
            <a href={nota.pdfUrl as string} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </a>
          ) : null}
          {nota.status === 'emitida' ? (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setCancelamentoOpen(true)}>
              <XCircle className="h-4 w-4" />
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Badge variant={st.variant}>{st.label}</Badge>
            <p className="text-muted-foreground">Emissão: {dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}</p>
            <p className="text-muted-foreground">Código: {(nota.codigoVerificacao as string) ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Tomador</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{(nota.tomadorNome as string) ?? '—'}</p>
            <p className="text-muted-foreground">{(nota.tomadorCpfCnpj as string) ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Serviço</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{formatCurrency(nota.valorServico as number)}</p>
            <p className="text-muted-foreground">{(nota.codigoServico as string) ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {nota.erroUltimaTentativa || nota.motivoCancelamento ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">Tratamento operacional</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {nota.erroUltimaTentativa ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Erro da última tentativa</p>
                <p className="mt-1 text-destructive">{nota.erroUltimaTentativa as string}</p>
              </div>
            ) : null}
            {nota.motivoCancelamento ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Motivo de cancelamento</p>
                <p className="mt-1">{nota.motivoCancelamento as string}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {nota.xmlNfse ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">XML</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
              {nota.xmlNfse as string}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-sm">Auditoria</CardTitle></CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            <div className="divide-y text-sm">
              {eventos.map((e) => {
                const criadoEm = e.criadoEm as Timestamp | undefined
                const criadoEmDate = tsToDate(criadoEm)
                return (
                  <div key={e.id as string} className="py-3">
                    <p className="font-medium">{(e.mensagem as string) ?? (e.tipo as string)}</p>
                    <p className="text-xs text-muted-foreground">
                      {criadoEmDate ? criadoEmDate.toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelamentoOpen} onOpenChange={setCancelamentoOpen}>
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
            <Button type="button" variant="outline" onClick={() => setCancelamentoOpen(false)} disabled={cancelando}>
              Cancelar
            </Button>
            <Button type="button" onClick={solicitarCancelamento} disabled={cancelando}>
              {cancelando ? 'Registrando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
