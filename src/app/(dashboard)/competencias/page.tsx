'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatMesAno } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { CompetenciaStatusBadge } from '@/components/ui/status-badge'
import { getStatusLabel } from '@/lib/status-semantics'
import { getErrorMessage } from '@/lib/error-message'
import { Plus, Layers, LayoutList, Group } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { competenciasFiltroSchema } from '@/features/competencias/schemas'
import { useCompetenciasList } from '@/features/competencias/hooks'
import type { CompetenciaRecord, CompetenciasFilters } from '@/features/competencias/types'
import { FilterSheet, FilterSheetTrigger } from '@/components/ui/filter-sheet'
import { useRouter } from 'next/navigation'
import { LinhaClicavel } from '@/components/ui/linha-clicavel'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { FiltrosAtivos } from '@/components/ui/filtros-ativos'
import { SeletorMes } from '@/components/ui/seletor-mes'
import { useNomeCliente } from '@/lib/use-nomes-filtro'
import { hrefComFiltro, hrefSemFiltro, inteiroDaUrl } from '@/lib/url-filtros'

function CompetenciasContent() {
  const searchParams = useSearchParams()

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const clienteIdUrl = searchParams.get('clienteId') ?? ''
  const mesUrl = inteiroDaUrl(searchParams.get('mes'))
  const anoUrl = inteiroDaUrl(searchParams.get('ano'))
  // Com cliente e sem mês explícito na URL ("Competências do cliente"), lista
  // o histórico inteiro dele; sem cliente, o padrão continua sendo o mês atual.
  const todosOsMeses = !!clienteIdUrl && mesUrl === null
  const parsed: CompetenciasFilters = competenciasFiltroSchema.parse({
    mes: todosOsMeses ? null : (mesUrl ?? mesAtual),
    ano: todosOsMeses ? null : (anoUrl ?? anoAtual),
    status: searchParams.get('status') ?? '',
    clienteId: clienteIdUrl,
    page: parseInt(searchParams.get('page') ?? '1') || 1,
  })
  const { mes, ano, status, clienteId, page } = parsed
  const { competencias, total, totalPages, isLoading, isError, error, refetch } = useCompetenciasList(parsed)
  const nomeCliente = useNomeCliente(clienteId, competencias[0]?.clienteNome)
  const periodo = mes != null && ano != null ? formatMesAno(mes, ano) : 'todos os meses'
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
        groupLabel: groupBy === 'status' ? getStatusLabel('competencia', key) : key,
        rows,
      }))
  }, [competencias, groupBy])

  // Parte da URL atual: quem chegou com ?mes=&ano= mantém; quem está vendo
  // "todos os meses" do cliente continua sem mês. '' remove a chave.
  function buildUrl(overrides: Record<string, string | number>) {
    return hrefComFiltro('/competencias', searchParams, { page: 1, ...overrides })
  }
  const hrefMes = (m: number, a: number) => buildUrl({ mes: m, ano: a })
  const novaHref = clienteId ? `/competencias/nova?clienteId=${encodeURIComponent(clienteId)}` : '/competencias/nova'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Competências"
        description={`${total} competência${total !== 1 ? 's' : ''} — ${periodo}`}
        action={
          <>
            <FilterSheetTrigger
              onClick={() => setFilterSheetOpen(true)}
              activeCount={status ? 1 : 0}
            />
            <LinkPermitido href={novaHref} semAcesso="ocultar" className={buttonVariants({ size: 'cta' })}>
              <Plus />
              Nova competência
            </LinkPermitido>
          </>
        }
      />

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
                {s === '' ? 'Todos' : getStatusLabel('competencia', s)}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      {/* Seletor de mês visível também no celular (status e agrupamento ficam
          no painel de filtros). "Todos os meses" só faz sentido com cliente. */}
      <div className="surface-subtle flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <SeletorMes
          mes={mes}
          ano={ano}
          hrefPara={hrefMes}
          hrefTodos={clienteId ? buildUrl({ mes: '', ano: '' }) : undefined}
        />

        <div className="hidden sm:flex items-center gap-1">
          {(['', 'aberta', 'em_andamento', 'concluida', 'cancelada'] as const).map((s) => (
            <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
              {s === '' ? 'Todos' : getStatusLabel('competencia', s)}
            </FilterBtn>
          ))}
        </div>

        <div className="ml-auto hidden sm:flex items-center gap-1">
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

      <FiltrosAtivos
        chips={[
          clienteId && { chave: 'clienteId', rotulo: 'Cliente', valor: nomeCliente, removerHref: hrefSemFiltro('/competencias', searchParams, ['clienteId']) },
          status && { chave: 'status', rotulo: 'Status', valor: getStatusLabel('competencia', status), removerHref: hrefSemFiltro('/competencias', searchParams, ['status']) },
        ]}
        limparHref={mes != null && ano != null ? `/competencias?mes=${mes}&ano=${ano}` : '/competencias'}
      />

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
            ) : isError ? (
              <TableEmptyState
                colSpan={5}
                icon={Layers}
                title="Não foi possível carregar as competências"
                description={getErrorMessage(error, 'Verifique sua conexão e tente novamente.')}
                action={{ label: 'Tentar novamente', onClick: () => { void refetch() } }}
              />
            ) : competencias.length === 0 ? (
              <TableEmptyState
                colSpan={5}
                icon={Layers}
                title="Nenhuma competência encontrada"
                description={status ? 'Tente ajustar os filtros.' : mes != null && ano != null ? `Nenhuma competência para ${formatMesAno(mes, ano)}.` : 'Este cliente ainda não tem competências.'}
                action={!status ? { label: 'Nova competência', href: novaHref } : undefined}
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
                  return (
                    <LinhaClicavel key={c.id as string} alvo={`/competencias/${c.id}`} className="transition-colors hover:bg-muted/35">
                      <td className="px-4 py-3">
                        <Link href={`/competencias/${c.id}`} className="font-medium hover:underline">
                          {(c.clienteNome as string) ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{(c.servicoNome as string) ?? '—'}</td>
                      <td className="px-4 py-3">{formatMesAno(c.mes as number, c.ano as number)}</td>
                      <td className="px-4 py-3"><CompetenciaStatusBadge status={c.status as string} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{(c.responsavelNome as string) ?? '—'}</td>
                    </LinhaClicavel>
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
              <Link href={buildUrl({ page: page - 1 })} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-9 rounded-xl' })}>
                Anterior
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={buildUrl({ page: page + 1 })} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-9 rounded-xl' })}>
                Próxima
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
