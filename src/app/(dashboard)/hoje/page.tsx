'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TaskCard, prioridadePeso } from '@/components/tarefas/task-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import { useHojeData } from '@/features/hoje/hooks'
import { bulkAlterarPrazo, bulkConcluirTarefas, bulkReatribuirTarefas } from '@/features/hoje/services'
import { hojeKeys } from '@/features/hoje/queries'
import { bulkDateSchema, bulkReassignSchema } from '@/features/hoje/schemas'
import type { HojeCockpitData, HojeTask, HojeUsuario } from '@/features/hoje/types'

const HOJE_RESPONSAVEL_STORAGE_KEY = 'hoje:responsavelId'

function slaScoreHoje(task: HojeTask) {
  const now = new Date()
  const prazo = task.dataPrazo?.toDate?.()
  const titulo = (task.titulo ?? '').toLowerCase()
  const tipoPeso =
    /nfse|nfs-e|das|imposto|fiscal|reinf|esocial|fgts|ir/.test(titulo) ? 3
    : /cobran|fatura|lancamento|pagament|receb/.test(titulo) ? 2
    : 1
  const urgenciaPeso: Record<string, number> = { urgente: 4, alta: 3, normal: 2, baixa: 1 }
  const urgencia = urgenciaPeso[task.prioridade ?? 'normal'] ?? 2
  if (!prazo) return (tipoPeso * 2) + urgencia
  const diffDays = Math.floor((now.getTime() - prazo.getTime()) / (1000 * 60 * 60 * 24))
  const diasAtraso = diffDays > 0 ? diffDays : 0
  const atrasoEscalonado = diasAtraso >= 3 ? diasAtraso + 3 : diasAtraso
  const semResponsavelPenalty = task.responsavelId ? 0 : 2
  return (tipoPeso * 2) + atrasoEscalonado + urgencia + semResponsavelPenalty
}

type TaskWithCategory = HojeTask & { _categoria: 'atrasada' | 'hoje' | 'proximos7dias' }

function HojeSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-16 rounded-2xl border bg-muted/40 animate-pulse" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl border bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl border bg-card/95 overflow-hidden">
        <div className="h-10 border-b bg-muted/30 animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 border-b last:border-0 bg-muted/20 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function HojePage() {
  const queryClient = useQueryClient()
  const [responsavelId, setResponsavelId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(HOJE_RESPONSAVEL_STORAGE_KEY) ?? ''
  })
  const { cockpit, usuarios, isLoading } = useHojeData(responsavelId || undefined)
  const data: HojeCockpitData = cockpit.data ?? { atrasadas: [], hoje: [], proximos7Dias: [], bloqueiosFechamento: [] }
  const usuariosData: HojeUsuario[] = usuarios.data ?? []
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkDate, setBulkDate] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(HOJE_RESPONSAVEL_STORAGE_KEY, responsavelId)
  }, [responsavelId])

  useEffect(() => { setSelectedIds([]) }, [responsavelId])

  const unifiedQueue = useMemo<TaskWithCategory[]>(() => {
    const withCat: TaskWithCategory[] = [
      ...data.atrasadas.map((t) => ({ ...t, _categoria: 'atrasada' as const })),
      ...data.hoje.map((t) => ({ ...t, _categoria: 'hoje' as const })),
      ...data.proximos7Dias.map((t) => ({ ...t, _categoria: 'proximos7dias' as const })),
    ]
    return withCat.sort((a, b) => {
      const score = slaScoreHoje(b) - slaScoreHoje(a)
      if (score !== 0) return score
      const p = prioridadePeso(a.prioridade) - prioridadePeso(b.prioridade)
      if (p !== 0) return p
      const at = a.dataPrazo?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
      const bt = b.dataPrazo?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
      return at - bt
    })
  }, [data])

  const allTaskIds = useMemo(() => unifiedQueue.map((t) => t.id), [unifiedQueue])
  const allSelected = selectedIds.length > 0 && selectedIds.length === allTaskIds.length

  const agora = useMemo(() => new Date(), [])
  const mesAtual = agora.getMonth() + 1
  const anoAtual = agora.getFullYear()
  const atrasadasCount = data.atrasadas.length
  const bloqueiosCount = data.bloqueiosFechamento.length

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))
  }

  async function concluirEmLote() {
    await bulkConcluirTarefas(selectedIds)
    await queryClient.invalidateQueries({ queryKey: hojeKeys.cockpit(responsavelId || undefined) })
    setSelectedIds([])
  }

  async function reatribuirEmLote() {
    const parsed = bulkReassignSchema.safeParse({ responsavelId: bulkAssignee })
    if (!parsed.success) return
    const user = usuariosData.find((u) => u.id === bulkAssignee)
    await bulkReatribuirTarefas(selectedIds, bulkAssignee, user?.nome ?? 'Responsavel')
    await queryClient.invalidateQueries({ queryKey: hojeKeys.cockpit(responsavelId || undefined) })
    setSelectedIds([])
  }

  async function alterarPrazoEmLote() {
    const parsed = bulkDateSchema.safeParse({ date: bulkDate })
    if (!parsed.success) return
    await bulkAlterarPrazo(selectedIds, bulkDate)
    await queryClient.invalidateQueries({ queryKey: hojeKeys.cockpit(responsavelId || undefined) })
    setSelectedIds([])
  }

  if (isLoading) return <HojeSkeleton />

  return (
    <div className="space-y-5">

      {/* BLOCO 1 — Header */}
      <div className="surface-subtle flex flex-wrap items-center justify-between gap-3 border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Hoje</h2>
          <p className="text-sm text-muted-foreground">Fila de execução ordenada por SLA</p>
        </div>
        <select
          className="h-10 rounded-xl border bg-background px-3 text-sm"
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
        >
          <option value="">Equipe inteira</option>
          {usuariosData.map((u) => (
            <option key={u.id} value={u.id}>{u.nome ?? 'Usuário'}</option>
          ))}
        </select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={cn(
          'flex flex-col gap-1 rounded-xl border px-4 py-3 card-shadow',
          atrasadasCount > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border/65 bg-card/95'
        )}>
          <span className="section-label">Atrasadas</span>
          <span className={cn('text-2xl font-bold tabular-nums', atrasadasCount > 0 ? 'text-destructive' : 'text-foreground')}>
            {atrasadasCount}
          </span>
        </div>
        <div className={cn(
          'flex flex-col gap-1 rounded-xl border px-4 py-3 card-shadow',
          data.hoje.length > 0 ? 'border-warning/30 bg-warning/5' : 'border-border/65 bg-card/95'
        )}>
          <span className="section-label">Vencem hoje</span>
          <span className={cn('text-2xl font-bold tabular-nums', data.hoje.length > 0 ? 'text-warning' : 'text-foreground')}>
            {data.hoje.length}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-border/65 bg-card/95 px-4 py-3 card-shadow">
          <span className="section-label">Próximos 7d</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">{data.proximos7Dias.length}</span>
        </div>
        <div className={cn(
          'flex flex-col gap-1 rounded-xl border px-4 py-3 card-shadow',
          bloqueiosCount > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border/65 bg-card/95'
        )}>
          <span className="section-label">Bloqueios</span>
          <span className={cn('text-2xl font-bold tabular-nums', bloqueiosCount > 0 ? 'text-destructive' : 'text-foreground')}>
            {bloqueiosCount}
          </span>
        </div>
      </div>

      {/* BLOCO 2 — Alerta crítico (máximo 1) */}
      {atrasadasCount > 0 ? (
        <InlineAlert
          tone="danger"
          title={`${atrasadasCount} tarefa${atrasadasCount !== 1 ? 's' : ''} em atraso`}
          description="Itens atrasados aparecem no topo da fila, ordenados por score SLA. Selecione e aja em lote para zerar o risco operacional."
        />
      ) : bloqueiosCount > 0 ? (
        <InlineAlert
          tone="warning"
          title={`${bloqueiosCount} cliente${bloqueiosCount !== 1 ? 's' : ''} com bloqueio no fechamento`}
          description="Resolva as pendências do fechamento para liberar o mês."
        />
      ) : null}

      {/* BLOCO 3 — Fila de ação unificada */}
      <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">

        {/* Barra de seleção + ações em lote */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={allSelected}
              onChange={(e) => setSelectedIds(e.target.checked ? allTaskIds : [])}
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.length > 0
                ? `${selectedIds.length} selecionada${selectedIds.length !== 1 ? 's' : ''}`
                : 'Selecionar todas'}
            </span>
          </label>
          {selectedIds.length > 0 && (
            <>
              <div className="w-px h-4 bg-border/60" />
              <Button size="sm" className="h-7 text-xs" onClick={() => void concluirEmLote()}>
                Concluir
              </Button>
              <select
                className="h-7 rounded-md border bg-background px-2 text-xs"
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
              >
                <option value="">Reatribuir para...</option>
                {usuariosData.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome ?? 'Usuário'}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void reatribuirEmLote()}
                disabled={!bulkAssignee}
              >
                Aplicar
              </Button>
              <input
                type="date"
                className="h-7 rounded-md border bg-background px-2 text-xs"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void alterarPrazoEmLote()}
                disabled={!bulkDate}
              >
                Alterar prazo
              </Button>
            </>
          )}
        </div>

        {unifiedQueue.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
              <span className="text-xl">✓</span>
            </div>
            <p className="text-sm font-semibold text-success">Fila zerada</p>
            <p className="text-xs text-muted-foreground mt-1">Nenhuma tarefa para os próximos 7 dias.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {unifiedQueue.map((task, i) => (
              <div
                key={task.id}
                className={cn(
                  'relative border-b border-border/50 last:border-0 lg:border-r lg:[&:nth-child(2n)]:border-r-0',
                  i % 2 === 0 && i === unifiedQueue.length - 1 && 'lg:col-span-2 lg:border-r-0'
                )}
              >
                {/* Categoria indicator — left border strip */}
                <div className={cn(
                  'absolute left-0 top-0 bottom-0 w-0.5',
                  task._categoria === 'atrasada' ? 'bg-destructive' :
                  task._categoria === 'hoje' ? 'bg-warning' :
                  'bg-transparent'
                )} />
                <div className="pl-2">
                  <TaskCard
                    task={task}
                    usuarios={usuariosData}
                    selected={selectedIds.includes(task.id)}
                    onToggleSelected={toggleSelected}
                    onUpdated={() => void cockpit.refetch()}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BLOCO 4 — Bloqueios de fechamento */}
      {bloqueiosCount > 0 && (
        <div className="overflow-hidden rounded-2xl border border-destructive/25 bg-destructive/3 card-shadow">
          <div className="flex items-center justify-between px-4 py-3 border-b border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-semibold">
                Bloqueios de fechamento ({bloqueiosCount})
              </span>
            </div>
            <Link
              href={`/fechamento?mes=${mesAtual}&ano=${anoAtual}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8')}
            >
              Abrir fechamento
            </Link>
          </div>
          <ul className="divide-y divide-destructive/10">
            {data.bloqueiosFechamento.slice(0, 10).map((f) => (
              <li key={f.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium">{f.clienteNome ?? 'Cliente'}</span>
                <Link
                  href={`/fechamento?mes=${mesAtual}&ano=${anoAtual}`}
                  className="text-xs text-primary hover:underline"
                >
                  Resolver →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
