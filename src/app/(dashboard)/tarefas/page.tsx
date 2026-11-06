'use client'

import { useState, useEffect, Suspense, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate , tsToDate } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { TarefaPrioridadeBadge, TarefaStatusBadge } from '@/components/ui/status-badge'
import { getStatusLabel } from '@/lib/status-semantics'
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
import { usePersistedFilters } from '@/lib/use-persisted-filters'
import { tarefasFiltroSchema } from '@/features/tarefas/schemas'
import { useTarefasList } from '@/features/tarefas/hooks'
import { tarefasKeys } from '@/features/tarefas/queries'
import { getErrorMessage } from '@/lib/error-message'
import type { TarefaRecord, TarefasFilters } from '@/features/tarefas/types'
import { useLinhaClicavel, PararLinha } from '@/components/ui/linha-clicavel'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { FiltrosAtivos } from '@/components/ui/filtros-ativos'
import { useNomeCliente, useNomeResponsavel, useRotuloCompetencia } from '@/lib/use-nomes-filtro'
import { hrefSemFiltro } from '@/lib/url-filtros'
import { LinkFichaCliente } from '@/components/clientes/ficha/painel-cliente'

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
  const { tarefas, total, totalPages, isLoading, isError, error, refetch } = useTarefasList(filters)
  const linha = useLinhaClicavel()
  // Filtros que chegam de outras telas ("Tarefas do cliente", da competência,
  // do responsável) agora aparecem como chips com o nome, e saem com um clique.
  const nomeCliente = useNomeCliente(clienteId, tarefas.find((t) => t.clienteId === clienteId)?.clienteNome as string | undefined)
  const nomeResponsavel = useNomeResponsavel(responsavelId, tarefas.find((t) => t.responsavelId === responsavelId)?.responsavelNome as string | undefined)
  const rotuloCompetencia = useRotuloCompetencia(competenciaId)
  const semFiltro = (...chaves: string[]) => hrefSemFiltro('/tarefas', searchParams, chaves)

  const [concluding, setConcluding] = useState<string | null>(null)
  const [confirmUrgente, setConfirmUrgente] = useState<{ id: string; titulo: string } | null>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  // Persist last used filters
  const [, saveFilters] = usePersistedFilters('tarefas-view', { status: '', prioridade: '' })
  useEffect(() => {
    if (status || prioridade) saveFilters({ status, prioridade })
  }, [status, prioridade, saveFilters])

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
      <PageHeader
        title="Tarefas"
        description={`${total} tarefa${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`}
        action={
          <>
            <FilterSheetTrigger
              onClick={() => setFilterSheetOpen(true)}
              activeCount={(status ? 1 : 0) + (prioridade ? 1 : 0)}
            />
            <LinkPermitido
              href={clienteId ? `/tarefas/nova?clienteId=${encodeURIComponent(clienteId)}` : '/tarefas/nova'}
              semAcesso="ocultar"
              className={buttonVariants({ size: 'cta' })}
            >
              <Plus />
              Nova tarefa
            </LinkPermitido>
          </>
        }
      />

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
                {s === '' ? 'Todos' : getStatusLabel('tarefa', s)}
              </FilterBtn>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prioridade</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'baixa', 'normal', 'alta', 'urgente'] as const).map((p) => (
              <FilterBtn key={p} href={buildUrl({ prioridade: p, page: 1 })} active={prioridade === p}>
                {p === '' ? 'Qualquer' : getStatusLabel('tarefaPrioridade', p)}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      <div className="surface-subtle hidden sm:flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <div className="flex items-center gap-1">
          {(['', 'pendente', 'em_andamento', 'concluida', 'cancelada'] as const).map((s) => (
            <FilterBtn key={s} href={buildUrl({ status: s, page: 1 })} active={status === s}>
              {s === '' ? 'Todos' : getStatusLabel('tarefa', s)}
            </FilterBtn>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['', 'baixa', 'normal', 'alta', 'urgente'] as const).map((p) => (
            <FilterBtn key={p} href={buildUrl({ prioridade: p, page: 1 })} active={prioridade === p}>
              {p === '' ? 'Qualquer' : getStatusLabel('tarefaPrioridade', p)}
            </FilterBtn>
          ))}
        </div>
        {/* A lista vem paginada do Firestore (sem busca por texto no servidor):
            o campo filtra só as linhas desta página, e diz isso. */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Filtrar nesta página…"
            aria-label={`Filtrar as ${tarefas.length} tarefas desta página por título, cliente ou responsável`}
            title="Filtra só as tarefas desta página. Para outras, use os filtros ou mude de página."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            className="h-8 w-52 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      <FiltrosAtivos
        chips={[
          clienteId && { chave: 'clienteId', rotulo: 'Cliente', valor: nomeCliente, removerHref: semFiltro('clienteId') },
          competenciaId && { chave: 'competenciaId', rotulo: 'Competência', valor: rotuloCompetencia, removerHref: semFiltro('competenciaId') },
          responsavelId && { chave: 'responsavelId', rotulo: 'Responsável', valor: nomeResponsavel, removerHref: semFiltro('responsavelId') },
          status && { chave: 'status', rotulo: 'Status', valor: getStatusLabel('tarefa', status), removerHref: semFiltro('status') },
          prioridade && { chave: 'prioridade', rotulo: 'Prioridade', valor: getStatusLabel('tarefaPrioridade', prioridade), removerHref: semFiltro('prioridade') },
          localSearch.trim() && { chave: 'busca-local', rotulo: 'Nesta página', valor: `“${localSearch.trim()}”`, onRemover: () => setLocalSearch('') },
        ]}
        limparHref="/tarefas"
        onLimpar={() => setLocalSearch('')}
      />

      <DataTableShell density="compact">
        <table className="w-full table-fixed text-sm sm:table-auto sm:min-w-[940px]">
          <thead className="hidden bg-muted/50 sm:table-header-group">
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
            ) : isError ? (
              <TableEmptyState
                colSpan={7}
                icon={ClipboardList}
                title="Não foi possível carregar as tarefas"
                description={getErrorMessage(error, 'Verifique sua conexão e tente novamente.')}
                action={{ label: 'Tentar novamente', onClick: () => { void refetch() } }}
              />
            ) : tarefas.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={ClipboardList}
                title="Nenhuma tarefa encontrada"
                description={status || prioridade || clienteId || responsavelId || competenciaId ? 'Tente ajustar os filtros.' : 'Clique em "Nova tarefa" para começar.'}
                action={!status && !prioridade ? { label: 'Nova tarefa', href: '/tarefas/nova' } : undefined}
              />
            ) : tarefasFiltradas.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={Search}
                title="Nenhuma tarefa desta página corresponde"
                description="O filtro de texto procura só nas tarefas desta página. Limpe o texto ou mude de página."
                action={{ label: 'Limpar texto', variant: 'outline', onClick: () => setLocalSearch('') }}
              />
            ) : tarefasFiltradas.map((t) => {
                const dataPrazo = t.dataPrazo as Timestamp | undefined
                const vencida =
                  dataPrazo &&
                  tsToDate(dataPrazo)! < hoje &&
                  !['concluida', 'cancelada'].includes(t.status as string)

                return (
                  <Fragment key={t.id as string}>
                  <tr {...linha(`/tarefas/${t.id as string}`, { className: 'transition-colors hover:bg-muted/35 hidden sm:table-row' })}>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/tarefas/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.titulo as string}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {t.clienteId ? (
                        <LinkFichaCliente clienteId={t.clienteId as string} nome={t.clienteNome as string | undefined} className="hover:text-foreground hover:underline">
                          {(t.clienteNome as string) ?? '—'}
                        </LinkFichaCliente>
                      ) : ((t.clienteNome as string) ?? '—')}
                    </td>
                    <td className="px-3 py-1.5">
                      {t.prioridade ? (
                        <TarefaPrioridadeBadge prioridade={t.prioridade as string} />
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
                      <TarefaStatusBadge status={t.status as string} />
                    </td>
                    <td className="px-3 py-1.5">
                      <PararLinha className="flex items-center justify-end gap-1">
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
                              className="h-7 w-7"
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
                      </PararLinha>
                    </td>
                  </tr>
                  <tr {...linha(`/tarefas/${t.id as string}`, { className: 'sm:hidden active:bg-muted/40' })}>
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
                            <TarefaStatusBadge status={t.status as string} />
                            {t.prioridade && (
                              <TarefaPrioridadeBadge prioridade={t.prioridade as string} />
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
