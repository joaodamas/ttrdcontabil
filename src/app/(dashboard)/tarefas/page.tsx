'use client'

import { useState, Suspense, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Loader2, ClipboardList, CheckCheck, UserX, ClockAlert, MoreHorizontal, Eye, UserCog, CalendarClock, Search } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'
import { FilterSheet, FilterSheetTrigger } from '@/components/ui/filter-sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DataTableShell } from '@/components/ui/data-table-shell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { concluirTarefa } from '@/features/tarefas/services'
import { tarefasFiltroSchema } from '@/features/tarefas/schemas'
import { useTarefasList } from '@/features/tarefas/hooks'
import { tarefasKeys } from '@/features/tarefas/queries'
import { getErrorMessage } from '@/lib/error-message'
import type { TarefaRecord, TarefasFilters } from '@/features/tarefas/types'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  concluida: { label: 'Concluída', variant: 'default' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
}

const PRIORIDADE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string; pulse?: boolean }> = {
  baixa:   { label: 'Baixa',   variant: 'outline' },
  normal:  { label: 'Normal',  variant: 'secondary' },
  alta:    { label: 'Alta',    variant: 'outline', className: 'border-warning/50 text-warning bg-warning/10' },
  urgente: { label: 'Urgente', variant: 'destructive', pulse: true },
}

function TarefasContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const filters: TarefasFilters = tarefasFiltroSchema.parse({
    status: searchParams.get('status') ?? '',
    prioridade: searchParams.get('prioridade') ?? '',
    responsavelId: searchParams.get('responsavelId') ?? '',
    clienteId: searchParams.get('clienteId') ?? '',
    competenciaId: searchParams.get('competenciaId') ?? '',
    page: parseInt(searchParams.get('page') ?? '1'),
  })
  const { status, prioridade, responsavelId, clienteId, competenciaId, page } = filters
  const { tarefas, total, totalPages, isLoading } = useTarefasList(filters)

  const [concluding, setConcluding] = useState<string | null>(null)
  const [confirmUrgente, setConfirmUrgente] = useState<{ id: string; titulo: string } | null>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const hoje = new Date()
  const tarefasFiltradas = localSearch.trim()
    ? tarefas.filter(t => {
        const q = localSearch.toLowerCase()
        return (
          String(t.titulo ?? '').toLowerCase().includes(q) ||
          String(t.clienteNome ?? '').toLowerCase().includes(q) ||
          String(t.responsavelNome ?? '').toLowerCase().includes(q)
        )
      })
    : tarefas

  async function handleConcluir(id: string, titulo: string) {
    setConcluding(id)
    await queryClient.cancelQueries({ queryKey: tarefasKeys.all })
    const previousLists = queryClient.getQueriesData<TarefaRecord[]>({ queryKey: tarefasKeys.all })
    const concluidaEm = Timestamp.now()
    queryClient.setQueriesData<TarefaRecord[]>({ queryKey: tarefasKeys.all }, (old) =>
      old?.map((tarefa) =>
        tarefa.id === id
          ? { ...tarefa, status: 'concluida', concluidaEm }
          : tarefa
      )
    )
    try {
      await concluirTarefa(id)
      toast.success(`"${titulo}" concluída`)
    } catch (err) {
      previousLists.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      toast.error(getErrorMessage(err, 'Não foi possível concluir a tarefa. Verifique permissões e tente novamente.'))
    } finally {
      await queryClient.invalidateQueries({ queryKey: tarefasKeys.all })
      setConcluding(null)
    }
  }

  function isTarefaFiscal(tarefa: TarefaRecord): boolean {
    const titulo = String(tarefa.titulo ?? '').toLowerCase()
    const descricao = String(tarefa.descricao ?? '').toLowerCase()
    const tipo = String(tarefa.tipo ?? tarefa.area ?? '').toLowerCase()
    return titulo.includes('fiscal') || descricao.includes('fiscal') || tipo === 'fiscal'
  }

  function handleConcluirClick(tarefa: TarefaRecord) {
    const id = tarefa.id as string
    const titulo = tarefa.titulo as string
    if ((tarefa.prioridade as string) === 'urgente' || isTarefaFiscal(tarefa)) {
      setConfirmUrgente({ id, titulo })
      return
    }
    void handleConcluir(id, titulo)
  }

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      ...(status && { status }),
      ...(prioridade && { prioridade }),
      ...(responsavelId && { responsavelId }),
      ...(clienteId && { clienteId }),
      ...(competenciaId && { competenciaId }),
      page: String(page),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/tarefas?${params.toString()}`
  }

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Tarefas</h2>
          <p className="text-sm text-muted-foreground">
            {total} tarefa{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterSheetTrigger
            onClick={() => setFilterSheetOpen(true)}
            activeCount={(status ? 1 : 0) + (prioridade ? 1 : 0)}
          />
          <Link href="/tarefas/nova">
            <Button size="sm" className="h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1" />
              Nova Tarefa
            </Button>
          </Link>
        </div>
      </div>

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={(status ? 1 : 0) + (prioridade ? 1 : 0)}
        onReset={() => router.push('/tarefas')}
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'pendente', 'em_andamento', 'concluida', 'cancelada'] as const).map((s) => (
              <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
                {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
              </FilterBtn>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prioridade</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'baixa', 'normal', 'alta', 'urgente'] as const).map((p) => (
              <FilterBtn key={p} href={buildUrl({ prioridade: p, page: 1 })} active={prioridade === p}>
                {p === '' ? 'Qualquer' : PRIORIDADE_MAP[p]?.label ?? p}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      <div className="surface-subtle hidden sm:flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <div className="flex items-center gap-1">
          {(['', 'pendente', 'em_andamento', 'concluida', 'cancelada'] as const).map((s) => (
            <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
              {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
            </FilterBtn>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['', 'baixa', 'normal', 'alta', 'urgente'] as const).map((p) => (
            <FilterBtn key={p} href={buildUrl({ prioridade: p, page: 1 })} active={prioridade === p}>
              {p === '' ? 'Qualquer' : PRIORIDADE_MAP[p]?.label ?? p}
            </FilterBtn>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar na página..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            className="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      <DataTableShell density="compact">
        <table className="min-w-[940px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left section-label">Título</th>
              <th className="px-3 py-2 text-left section-label">Cliente</th>
              <th className="px-3 py-2 text-left section-label">Prioridade</th>
              <th className="px-3 py-2 text-left section-label">Responsável</th>
              <th className="px-3 py-2 text-left section-label">Prazo</th>
              <th className="px-3 py-2 text-left section-label">Status</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <TableRowSkeleton cols={7} rows={8} />
            ) : tarefas.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={ClipboardList}
                title="Nenhuma tarefa encontrada"
                description={status || prioridade ? 'Tente ajustar os filtros.' : 'Clique em "Nova Tarefa" para começar.'}
                action={!status && !prioridade ? { label: 'Nova Tarefa', href: '/tarefas/nova' } : undefined}
              />
            ) : tarefasFiltradas.map((t) => {
                const st = STATUS_MAP[t.status as string] ?? {
                  label: t.status as string,
                  variant: 'outline' as const,
                }
                const pr = PRIORIDADE_MAP[t.prioridade as string] ?? {
                  label: (t.prioridade as string) ?? '—',
                  variant: 'outline' as const,
                }
                const dataPrazo = t.dataPrazo as Timestamp | undefined
                const vencida =
                  dataPrazo &&
                  tsToDate(dataPrazo)! < hoje &&
                  !['concluida', 'cancelada'].includes(t.status as string)

                return (
                  <Fragment key={t.id as string}>
                  <tr className="transition-colors hover:bg-muted/35 hidden sm:table-row">
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/tarefas/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.titulo as string}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {(t.clienteNome as string) ?? '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      {t.prioridade ? (
                        <Badge variant={pr.variant} className={pr.className}>
                          {pr.pulse && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
                          )}
                          {pr.label}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {t.responsavelNome ? (
                        t.responsavelNome as string
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning font-medium" title="Tarefa sem responsável">
                          <UserX className="w-3.5 h-3.5" />
                          Sem responsável
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {dataPrazo ? (
                        <span className={vencida ? 'text-destructive font-medium' : ''}>
                          {formatDate(tsToDate(dataPrazo))}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning font-medium" title="Tarefa sem prazo definido">
                          <ClockAlert className="w-3.5 h-3.5" />
                          Sem prazo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-3 py-1.5">
                      {!['concluida', 'cancelada'].includes(t.status as string) && (
                        <button
                          onClick={() => handleConcluirClick(t)}
                          disabled={concluding === (t.id as string)}
                          className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-50 cursor-pointer"
                          title="Concluir tarefa"
                        >
                          {concluding === (t.id as string)
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCheck className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 ml-1"
                              title="Mais ações"
                            />
                          }
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/tarefas/${t.id as string}`)}>
                            <Eye className="w-4 h-4" />
                            Ver detalhe
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/tarefas/${t.id as string}/editar?focus=responsavel`)}>
                            <UserCog className="w-4 h-4" />
                            Reatribuir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/tarefas/${t.id as string}/editar?focus=prazo`)}>
                            <CalendarClock className="w-4 h-4" />
                            Alterar prazo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  <tr className="sm:hidden">
                    <td colSpan={7} className="px-3 py-2 sm:hidden">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/tarefas/${t.id as string}`} className="font-medium text-sm hover:underline">
                            {t.titulo as string}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(t.clienteNome as string) ?? '—'}
                            {t.responsavelNome ? ` · ${t.responsavelNome as string}` : ''}
                            {dataPrazo ? ` · ${formatDate(tsToDate(dataPrazo))}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {t.prioridade && (
                              <Badge variant={pr.variant} className={pr.className}>
                                {pr.pulse && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
                                )}
                                {pr.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {!['concluida', 'cancelada'].includes(t.status as string) && (
                          <button
                            onClick={() => handleConcluirClick(t)}
                            disabled={concluding === (t.id as string)}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                            title="Concluir tarefa"
                          >
                            {concluding === (t.id as string)
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <CheckCheck className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                )
              })}
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
      <ConfirmDialog
        open={!!confirmUrgente}
        onOpenChange={(open) => { if (!open) setConfirmUrgente(null) }}
        title="Concluir tarefa urgente/fiscal?"
        description={confirmUrgente
          ? `Você está concluindo a tarefa "${confirmUrgente.titulo}". Confirme para finalizar.`
          : 'Confirme para concluir a tarefa.'}
        confirmLabel="Confirmar conclusão"
        onConfirm={async () => {
          if (!confirmUrgente) return
          await handleConcluir(confirmUrgente.id, confirmUrgente.titulo)
          setConfirmUrgente(null)
        }}
      />
    </div>
  )
}

export default function TarefasPage() {
  return (
    <Suspense fallback={<div className="space-y-3 py-6"><div className="h-9 w-56 bg-muted rounded-lg animate-pulse" /><div className="h-64 w-full bg-muted/80 rounded-xl animate-pulse" /></div>}>
      <TarefasContent />
    </Suspense>
  )
}
