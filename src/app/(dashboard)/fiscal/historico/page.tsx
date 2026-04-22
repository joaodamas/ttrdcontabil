'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { listDocuments } from '@/lib/firestore-client'
import { formatDate, formatCurrency , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida: { label: 'Emitida', variant: 'default' },
  pendente_processamento: { label: 'Pendente', variant: 'outline' },
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
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allNotas, setAllNotas] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const constraints = [
      ...(clienteId ? [where('clienteId', '==', clienteId)] : []),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('criadoEm', 'desc'),
    ]
    listDocuments('nfse_emitidas', constraints).then((data) => {
      let filtered = data as Array<Record<string, unknown>>
      if (mes || ano) {
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
      setAllNotas(filtered)
    }).finally(() => setLoading(false))
  }, [clienteId, status, mes, ano])

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      ...(clienteId && { clienteId }),
      ...(status && { status }),
      ...(mes && { mes: String(mes) }),
      ...(ano && { ano: String(ano) }),
      page: String(page),
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

  const total = allNotas.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const notas = allNotas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/fiscal">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Histórico de NFS-e</h2>
          <p className="text-sm text-muted-foreground">
            {total} nota{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['', 'emitida', 'pendente_processamento', 'rejeitada', 'cancelada', 'erro_integracao'].map(
          (s) => (
            <Link key={s} href={buildUrl({ status: s, page: 1 })}>
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

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cliente</th>
              <th className="px-4 py-3 text-left font-medium">Nº NFS-e</th>
              <th className="px-4 py-3 text-left font-medium">Tomador</th>
              <th className="px-4 py-3 text-left font-medium">Emissão</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {notas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma NFS-e encontrada.
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
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={buildUrl({ page: page - 1 })}>
                <Button variant="outline" size="sm">
                  Anterior
                </Button>
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={buildUrl({ page: page + 1 })}>
                <Button variant="outline" size="sm">
                  Próxima
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function FiscalHistoricoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <FiscalHistoricoContent />
    </Suspense>
  )
}
