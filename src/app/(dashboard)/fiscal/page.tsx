'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate, formatCurrency, tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, CheckCircle, XCircle, AlertTriangle, Plus, Loader2, Trash2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { EmitirLoteModal } from '@/components/fiscal/emitir-lote-modal'
import { removeRascunho } from '@/features/fiscal/services'
import { useFiscalDashboard } from '@/features/fiscal/hooks'
import { fiscalKeys } from '@/features/fiscal/queries'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida: { label: 'Emitida', variant: 'default' },
  pendente_processamento: { label: 'Pendente', variant: 'outline' },
  aguardando_emissao: { label: 'Aguardando', variant: 'secondary' },
  rejeitada: { label: 'Rejeitada', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'secondary' },
  erro_integracao: { label: 'Erro', variant: 'destructive' },
}

export default function FiscalPage() {
  const queryClient = useQueryClient()
  const [loteOpen, setLoteOpen] = useState(false)
  const { isLoading: loading, emitidaMesCount, somaEmitidaMes, pendenteCount, erroCount, canceladaCount, notas } = useFiscalDashboard()

  async function deleteRascunho(id: string) {
    try {
      await removeRascunho(id)
      await queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() })
      toast.success('Rascunho removido.')
    } catch {
      toast.error('Erro ao remover rascunho.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Fiscal — NFS-e</h2>
          <p className="text-sm text-muted-foreground">
            {emitidaMesCount} nota{emitidaMesCount !== 1 ? 's' : ''} emitida{emitidaMesCount !== 1 ? 's' : ''} este mês
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/fiscal/historico">
            <Button variant="outline" size="sm" className="h-10 rounded-xl">Histórico</Button>
          </Link>
          <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => setLoteOpen(true)}>
            <Layers className="w-4 h-4 mr-1" />
            Lote
          </Button>
          <Link href="/fiscal/emitir">
            <Button size="sm" className="h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1" />
              Emitir NFS-e
            </Button>
          </Link>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Emitidas no Mês
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value">{emitidaMesCount}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(somaEmitidaMes)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value">{pendenteCount}</p>
          </CardContent>
        </Card>

        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Erros</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value text-destructive">{erroCount}</p>
          </CardContent>
        </Card>

        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Canceladas no Mês
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value">{canceladaCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Notas recentes */}
      <Card className="border-border/65 bg-card/95 card-shadow">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Notas Recentes</CardTitle>
            <Link href="/fiscal/historico" className="text-xs text-primary hover:underline">
              Ver todas
            </Link>
          </div>
        </CardHeader>
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left section-label">Cliente</th>
                <th className="px-4 py-3 text-left section-label">Nº NFS-e</th>
                <th className="px-4 py-3 text-left section-label">Emissão</th>
                <th className="px-4 py-3 text-right section-label">Valor</th>
                <th className="px-4 py-3 text-left section-label">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {notas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma NFS-e emitida.
                  </td>
                </tr>
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
                      <td className="px-4 py-3 text-muted-foreground">
                        {dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency((n.valorServico as number) ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {n._origem === 'rascunho' && (
                          <button
                            onClick={() => deleteRascunho(n.id as string)}
                            className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Remover rascunho"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <EmitirLoteModal
        open={loteOpen}
        onOpenChange={setLoteOpen}
        onSuccess={() => {
          setLoteOpen(false)
          void queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() })
        }}
      />
    </div>
  )
}
