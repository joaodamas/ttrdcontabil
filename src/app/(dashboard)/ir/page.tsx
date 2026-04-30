'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { listDocuments } from '@/lib/firestore-client'
import { formatDate , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, FileText } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  entregue: { label: 'Entregue', variant: 'default' },
  retificado: { label: 'Retificado', variant: 'secondary' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
}

const PAGE_SIZE = 20

function IrContent() {
  const searchParams = useSearchParams()
  const anoBaseAtual = new Date().getFullYear() - 1
  const anoBase = searchParams.get('anoBase') ? parseInt(searchParams.get('anoBase')!) : anoBaseAtual
  const status = searchParams.get('status') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allDeclaracoes, setAllDeclaracoes] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const anosDisponiveis = [anoBaseAtual, anoBaseAtual - 1, anoBaseAtual - 2, anoBaseAtual - 3]

  useEffect(() => {
    setLoading(true)
    const constraints = [
      where('anoBase', '==', anoBase),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('clienteNome', 'asc'),
    ]
    listDocuments('ir_declaracoes', constraints)
      .then((data) => setAllDeclaracoes(data as Array<Record<string, unknown>>))
      .finally(() => setLoading(false))
  }, [anoBase, status])

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      anoBase: String(anoBase),
      ...(status && { status }),
      page: String(page),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/ir?${params.toString()}`
  }

  const total = allDeclaracoes.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const declaracoes = allDeclaracoes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Declarações de IR</h2>
          <p className="text-sm text-muted-foreground">
            {total} declaraç{total !== 1 ? 'ões' : 'ão'} — Ano-base {anoBase}
          </p>
        </div>
        <Link href="/ir/nova">
          <Button size="sm" className="h-10 rounded-xl">
            <Plus className="w-4 h-4 mr-1" />
            Nova Declaração
          </Button>
        </Link>
      </div>

      <div className="surface-subtle flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <div className="flex items-center gap-1">
          {anosDisponiveis.map((a) => (
            <FilterBtn key={a} href={buildUrl({ anoBase: a, page: 1 })} active={anoBase === a}>
              {a}
            </FilterBtn>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['', 'pendente', 'em_andamento', 'entregue', 'retificado', 'cancelado'] as const).map((s) => (
            <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
              {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
            </FilterBtn>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left section-label">Cliente</th>
              <th className="px-4 py-3 text-left section-label">Ano-base</th>
              <th className="px-4 py-3 text-left section-label">Status</th>
              <th className="px-4 py-3 text-left section-label">Responsável</th>
              <th className="px-4 py-3 text-left section-label">Data Entrega</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <TableRowSkeleton cols={5} rows={6} />
            ) : declaracoes.length === 0 ? (
              <TableEmptyState
                colSpan={5}
                icon={FileText}
                title="Nenhuma declaração encontrada"
                description={status ? 'Tente ajustar os filtros.' : `Nenhuma declaração para ${anoBase}.`}
                action={!status ? { label: 'Nova Declaração', href: '/ir/nova' } : undefined}
              />
            ) : (
              declaracoes.map((d) => {
                const s = STATUS_MAP[d.status as string] ?? {
                  label: d.status as string,
                  variant: 'outline' as const,
                }
                const dataEntrega = d.dataEntrega as Timestamp | undefined
                return (
                  <tr key={d.id as string} className="transition-colors hover:bg-muted/35">
                    <td className="px-4 py-3">
                      <Link
                        href={`/ir/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {(d.clienteNome as string) ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{d.anoBase as number}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(d.responsavelNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {dataEntrega ? formatDate(tsToDate(dataEntrega)) : '—'}
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
              <Link href={buildUrl({ page: page - 1 })}>
                <Button variant="outline" size="sm" className="h-9 rounded-xl">
                  Anterior
                </Button>
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={buildUrl({ page: page + 1 })}>
                <Button variant="outline" size="sm" className="h-9 rounded-xl">
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

export default function IrPage() {
  return (
    <Suspense fallback={<div className="space-y-3 py-6"><div className="h-9 w-56 bg-muted rounded-lg animate-pulse" /><div className="h-64 w-full bg-muted/80 rounded-xl animate-pulse" /></div>}>
      <IrContent />
    </Suspense>
  )
}
