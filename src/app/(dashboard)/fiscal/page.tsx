'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'

import { listDocuments } from '@/lib/firestore-client'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, CheckCircle, XCircle, AlertTriangle, Plus, Loader2 } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida: { label: 'Emitida', variant: 'default' },
  pendente_processamento: { label: 'Pendente', variant: 'outline' },
  rejeitada: { label: 'Rejeitada', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'secondary' },
  erro_integracao: { label: 'Erro', variant: 'destructive' },
}

export default function FiscalPage() {
  const [loading, setLoading] = useState(true)
  const [emitidaMesCount, setEmitidaMesCount] = useState(0)
  const [somaEmitidaMes, setSomaEmitidaMes] = useState(0)
  const [pendenteCount, setPendenteCount] = useState(0)
  const [erroCount, setErroCount] = useState(0)
  const [canceladaCount, setCanceladaCount] = useState(0)
  const [notas, setNotas] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    const hoje = new Date()
    const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))

    Promise.all([
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
      listDocuments('nfse_emitidas', [orderBy('criadoEm', 'desc'), limit(10)]),
    ]).then(([emitidaMesData, pendenteData, erroData, canceladaData, recentesData]) => {
      setEmitidaMesCount(emitidaMesData.length)
      setSomaEmitidaMes(emitidaMesData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valorServico as number) ?? 0), 0))
      setPendenteCount(pendenteData.length)
      setErroCount(erroData.length)
      setCanceladaCount(canceladaData.length)
      setNotas(recentesData as Array<Record<string, unknown>>)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Fiscal — NFS-e</h2>
          <p className="text-sm text-muted-foreground">
            {emitidaMesCount} nota{emitidaMesCount !== 1 ? 's' : ''} emitida{emitidaMesCount !== 1 ? 's' : ''} este mês
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/fiscal/historico">
            <Button variant="outline" size="sm">Histórico</Button>
          </Link>
          <Link href="/fiscal/emitir">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Emitir NFS-e
            </Button>
          </Link>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Emitidas no Mês
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{emitidaMesCount}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(somaEmitidaMes)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendenteCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Erros</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{erroCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Canceladas no Mês
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{canceladaCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Notas recentes */}
      <Card>
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nº NFS-e</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Emissão</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {notas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
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
                    <tr key={n.id as string} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{(n.clienteNome as string) ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {(n.numeroNfse as string) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {dataEmissao ? formatDate(dataEmissao.toDate()) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(n.valorServico as number)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
