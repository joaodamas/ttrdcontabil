'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatMesAno } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ChevronLeft, ChevronRight, Layers, LayoutList, Group } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { competenciasFiltroSchema } from '@/features/competencias/schemas'
import { useCompetenciasList } from '@/features/competencias/hooks'
import type { CompetenciaRecord, CompetenciasFilters } from '@/features/competencias/types'
import { FilterSheet, FilterSheetTrigger } from '@/components/ui/filter-sheet'
import { useRouter } from 'next/navigation'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  aberta: { label: 'Aberta', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  concluida: { label: 'Concluída', variant: 'default' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
}

function CompetenciasContent() {
  const searchParams = useSearchParams()

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const parsed: CompetenciasFilters = competenciasFiltroSchema.parse({
    mes: searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : mesAtual,
    ano: searchParams.get('ano') ? parseInt(searchParams.get('ano')!) : anoAtual,
    status: searchParams.get('status') ?? '',
    clienteId: searchParams.get('clienteId') ?? '',
    page: parseInt(searchParams.get('page') ?? '1'),
  })
  const { mes, ano, status, clienteId, page } = parsed
  const { competencias, total, totalPages, isLoading } = useCompetenciasList(parsed)
  const router = useRouter()
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'responsavel'>('none')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  type GroupedRows = Array<{ groupKey: string; groupLabel: string; rows: CompetenciaRecord[] }>

  const groupedRows = useMemo((): GroupedRows => {
    if (groupBy === 'none') return [{ groupKey: 'all', groupLabel: '', rows: competencias }]
    const map = new Map<string, CompetenciaRecord[]>()
    for (const c of competencias) {
      const key = groupBy === 'status'
        ? (c.status as string) ?? 'sem_status'
        : (c.responsavelNome as string | undefined) ?? 'Sem responsável'
      const arr = map.get(key) ?? []
      arr.push(c)
      map.set(key, arr)
    }
    const statusOrder = ['aberta', 'em_andamento', 'concluida', 'cancelada']
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (groupBy === 'status') return statusOrder.indexOf(a) - statusOrder.indexOf(b)
        return a.localeCompare(b)
      })
      .map(([key, rows]) => ({
        groupKey: key,
        groupLabel: groupBy === 'status' ? (STATUS_MAP[key]?.label ?? key) : key,
        rows,
      }))
  }, [competencias, groupBy])

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

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Competências</h2>
          <p className="text-sm text-muted-foreground">
            {total} competência{total !== 1 ? 's' : ''} — {formatMesAno(mes, ano)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterSheetTrigger
            onClick={() => setFilterSheetOpen(true)}
            activeCount={status ? 1 : 0}
          />
          <Link href="/competencias/nova">
            <Button size="sm" className="h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1" />
              Nova Competência
            </Button>
          </Link>
        </div>
      </div>

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={status ? 1 : 0}
        onReset={() => router.push(buildUrl({ status: '', page: 1 }))}
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'aberta', 'em_andamento', 'concluida', 'cancelada'] as const).map(s => (
              <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
                {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      <div className="surface-subtle hidden sm:flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Link
            href={buildUrl(
              mes === 1 ? { mes: 12, ano: ano - 1, page: 1 } : { mes: mes - 1, page: 1 }
            )}
          >
            <Button variant="outline" size="sm" className="h-9 w-9 rounded-xl p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="px-3 text-sm font-medium">{formatMesAno(mes, ano)}</span>
          <Link
            href={buildUrl(
              mes === 12 ? { mes: 1, ano: ano + 1, page: 1 } : { mes: mes + 1, page: 1 }
            )}
          >
            <Button variant="outline" size="sm" className="h-9 w-9 rounded-xl p-0">
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

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Agrupar:</span>
          {([
            ['none',       'Lista',         LayoutList],
            ['status',     'Por status',    Group],
            ['responsavel','Por responsável',Group],
          ] as const).map(([val, label, Icon]) => (
            <button
              key={val}
              type="button"
              onClick={() => setGroupBy(val)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${groupBy === val ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
            >
              <Icon className="h-3 w-3" />{label}
            </button>
          ))}
        </div>
      </div>

      <DataTableShell density="compact">
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
            {isLoading ? (
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
              groupedRows.flatMap(({ groupKey, groupLabel, rows }) => [
                groupBy !== 'none' && (
                  <tr key={`group-${groupKey}`}>
                    <td colSpan={5} className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-t">
                      {groupLabel} <span className="ml-2 font-normal normal-case tracking-normal">({rows.length})</span>
                    </td>
                  </tr>
                ),
                ...rows.map((c: CompetenciaRecord) => {
                  const s = STATUS_MAP[c.status as string] ?? {
                    label: c.status as string,
                    variant: 'outline' as const,
                  }
                  return (
                    <tr key={c.id as string} className="transition-colors hover:bg-muted/35">
                      <td className="px-4 py-3">
                        <Link href={`/competencias/${c.id}`} className="font-medium hover:underline">
                          {(c.clienteNome as string) ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{(c.servicoNome as string) ?? '—'}</td>
                      <td className="px-4 py-3">{formatMesAno(c.mes as number, c.ano as number)}</td>
                      <td className="px-4 py-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{(c.responsavelNome as string) ?? '—'}</td>
                    </tr>
                  )
                }),
              ])
            )}
          </tbody>
        </table>
      </DataTableShell>

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

export default function CompetenciasPage() {
  return (
    <Suspense fallback={<div className="space-y-3 py-6"><div className="h-9 w-56 bg-muted rounded-lg animate-pulse" /><div className="h-64 w-full bg-muted/80 rounded-xl animate-pulse" /></div>}>
      <CompetenciasContent />
    </Suspense>
  )
}
