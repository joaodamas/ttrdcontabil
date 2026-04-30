'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { listDocuments, updateDocument } from '@/lib/firestore-client'
import { formatDate , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Loader2, ClipboardList, CheckCheck, UserX, ClockAlert, MoreHorizontal, Eye, UserCog, CalendarClock } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

const PAGE_SIZE = 20

function TarefasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const prioridade = searchParams.get('prioridade') ?? ''
  const responsavelId = searchParams.get('responsavelId') ?? ''
  const clienteId = searchParams.get('clienteId') ?? ''
  const competenciaId = searchParams.get('competenciaId') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allTarefas, setAllTarefas] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [concluding, setConcluding] = useState<string | null>(null)
  const [confirmUrgente, setConfirmUrgente] = useState<{ id: string; titulo: string } | null>(null)

  const hoje = new Date()

  async function handleConcluir(id: string, titulo: string) {
    setConcluding(id)
    try {
      await updateDocument('tarefas', id, { status: 'concluida', concluidaEm: new Date() })
      setAllTarefas((prev) => prev.map((t) => t.id === id ? { ...t, status: 'concluida' } : t))
      toast.success(`"${titulo}" concluída`)
    } catch {
      toast.error('Erro ao concluir tarefa.')
    } finally {
      setConcluding(null)
    }
  }

  function handleConcluirClick(tarefa: Record<string, unknown>) {
    const id = tarefa.id as string
    const titulo = tarefa.titulo as string
    if ((tarefa.prioridade as string) === 'urgente') {
      setConfirmUrgente({ id, titulo })
      return
    }
    void handleConcluir(id, titulo)
  }

  useEffect(() => {
    setLoading(true)
    const constraints = [
      ...(status ? [where('status', '==', status)] : []),
      ...(prioridade ? [where('prioridade', '==', prioridade)] : []),
      ...(responsavelId ? [where('responsavelId', '==', responsavelId)] : []),
      ...(clienteId ? [where('clienteId', '==', clienteId)] : []),
      ...(competenciaId ? [where('competenciaId', '==', competenciaId)] : []),
      orderBy('dataVencimento', 'asc'),
    ]
    listDocuments('tarefas', constraints)
      .then((data) => setAllTarefas(data as Array<Record<string, unknown>>))
      .finally(() => setLoading(false))
  }, [status, prioridade, responsavelId, clienteId, competenciaId])

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

  const total = allTarefas.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const tarefas = allTarefas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tarefas</h2>
          <p className="text-sm text-muted-foreground">
            {total} tarefa{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/tarefas/nova">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Nova Tarefa
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left section-label">Título</th>
              <th className="px-4 py-3 text-left section-label">Cliente</th>
              <th className="px-4 py-3 text-left section-label">Prioridade</th>
              <th className="px-4 py-3 text-left section-label">Responsável</th>
              <th className="px-4 py-3 text-left section-label">Prazo</th>
              <th className="px-4 py-3 text-left section-label">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <TableRowSkeleton cols={7} rows={8} />
            ) : tarefas.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={ClipboardList}
                title="Nenhuma tarefa encontrada"
                description={status || prioridade ? 'Tente ajustar os filtros.' : 'Clique em "Nova Tarefa" para começar.'}
                action={!status && !prioridade ? { label: 'Nova Tarefa', href: '/tarefas/nova' } : undefined}
              />
            ) : tarefas.map((t) => {
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
                  <tr key={t.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/tarefas/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.titulo as string}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(t.clienteNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.responsavelNome ? (
                        t.responsavelNome as string
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning font-medium" title="Tarefa sem responsável">
                          <UserX className="w-3.5 h-3.5" />
                          Sem responsável
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
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
                )
              })}
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
      <ConfirmDialog
        open={!!confirmUrgente}
        onOpenChange={(open) => { if (!open) setConfirmUrgente(null) }}
        title="Concluir tarefa urgente?"
        description={confirmUrgente
          ? `Você está concluindo a tarefa "${confirmUrgente.titulo}". Confirme para finalizar.`
          : 'Confirme para concluir a tarefa urgente.'}
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
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <TarefasContent />
    </Suspense>
  )
}
