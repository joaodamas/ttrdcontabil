'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy } from 'firebase/firestore'

import { listDocuments } from '@/lib/firestore-client'
import { formatMesAno } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ChevronLeft, ChevronRight, Loader2, Layers } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  aberta: { label: 'Aberta', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  concluida: { label: 'Concluída', variant: 'default' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
}

const PAGE_SIZE = 20

function CompetenciasContent() {
  const searchParams = useSearchParams()

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : mesAtual
  const ano = searchParams.get('ano') ? parseInt(searchParams.get('ano')!) : anoAtual
  const status = searchParams.get('status') ?? ''
  const clienteId = searchParams.get('clienteId') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allCompetencias, setAllCompetencias] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true)
      const constraints = [
        where('mes', '==', mes),
        where('ano', '==', ano),
        ...(status ? [where('status', '==', status)] : []),
        ...(clienteId ? [where('clienteId', '==', clienteId)] : []),
        orderBy('clienteNome', 'asc'),
      ]
      listDocuments('competencias', constraints)
        .then((data) => setAllCompetencias(data as Array<Record<string, unknown>>))
        .finally(() => setLoading(false))
    })
  }, [mes, ano, status, clienteId])

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      mes: String(mes),
      ano: String(ano),
      ...(status && { status }),
      ...(clienteId && { clienteId }),
      page: String(page),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/competencias?${params.toString()}`
  }

  const total = allCompetencias.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const competencias = allCompetencias.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Competências</h2>
          <p className="text-sm text-muted-foreground">
            {total} competência{total !== 1 ? 's' : ''} — {formatMesAno(mes, ano)}
          </p>
        </div>
        <Link href="/competencias/nova">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Nova Competência
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={buildUrl(
              mes === 1 ? { mes: 12, ano: ano - 1, page: 1 } : { mes: mes - 1, page: 1 }
            )}
          >
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="px-3 text-sm font-medium">{formatMesAno(mes, ano)}</span>
          <Link
            href={buildUrl(
              mes === 12 ? { mes: 1, ano: ano + 1, page: 1 } : { mes: mes + 1, page: 1 }
            )}
          >
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {(['', 'aberta', 'em_andamento', 'concluida', 'cancelada'] as const).map((s) => (
            <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
              {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
            </FilterBtn>
          ))}
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left section-label">Cliente</th>
              <th className="px-4 py-3 text-left section-label">Serviço</th>
              <th className="px-4 py-3 text-left section-label">Mês/Ano</th>
              <th className="px-4 py-3 text-left section-label">Status</th>
              <th className="px-4 py-3 text-left section-label">Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <TableRowSkeleton cols={5} rows={8} />
            ) : competencias.length === 0 ? (
              <TableEmptyState
                colSpan={5}
                icon={Layers}
                title="Nenhuma competência encontrada"
                description={status ? 'Tente ajustar os filtros.' : `Nenhuma competência para ${formatMesAno(mes, ano)}.`}
                action={!status ? { label: 'Nova Competência', href: '/competencias/nova' } : undefined}
              />
            ) : (
              competencias.map((c) => {
                const s = STATUS_MAP[c.status as string] ?? {
                  label: c.status as string,
                  variant: 'outline' as const,
                }
                return (
                  <tr key={c.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/competencias/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {(c.clienteNome as string) ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.servicoNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {formatMesAno(c.mes as number, c.ano as number)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.responsavelNome as string) ?? '—'}
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

export default function CompetenciasPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <CompetenciasContent />
    </Suspense>
  )
}
