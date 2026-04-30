'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TaskCard, prioridadePeso } from '@/components/tarefas/task-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { InsightStrip } from '@/components/ui/insight-strip'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
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
    /nfse|nfs-e|das|imposto|fiscal|reinf|esocial|fgts|ir/.test(titulo)
      ? 3
      : /cobran|fatura|lancamento|pagament|receb/.test(titulo)
        ? 2
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

function sortTasksBySla(items: HojeTask[]) {
  return [...items].sort((a, b) => {
    const score = slaScoreHoje(b) - slaScoreHoje(a)
    if (score !== 0) return score
    const p = prioridadePeso(a.prioridade) - prioridadePeso(b.prioridade)
    if (p !== 0) return p
    const at = a.dataPrazo?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
    const bt = b.dataPrazo?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
    return at - bt
  })
}

export default function HojePage() {
  const loteRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    setSelectedIds([])
  }, [responsavelId])

  const allTaskIds = useMemo(
    () => [...data.atrasadas, ...data.hoje, ...data.proximos7Dias].map((t) => t.id),
    [data]
  )

  const sortedAtrasadas = useMemo(() => sortTasksBySla(data.atrasadas), [data.atrasadas])

  const resolverFila = useCallback(() => {
    setSelectedIds(sortedAtrasadas.map((t) => t.id))
    window.setTimeout(() => {
      loteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [sortedAtrasadas])

  const agora = useMemo(() => new Date(), [])
  const mesAtual = agora.getMonth() + 1
  const anoAtual = agora.getFullYear()
  const atrasadasCount = data.atrasadas.length
  const bloqueiosCount = data.bloqueiosFechamento.length
  const itensCriticos = atrasadasCount + bloqueiosCount

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="stack-6">
      <div className="surface-subtle flex flex-wrap items-center justify-between gap-3 border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-title">Hoje</h2>
          <p className="text-subtle">Prioridade do dia com ação rápida</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => void Promise.all([cockpit.refetch(), usuarios.refetch()])}
          >
            Atualizar
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/65 bg-card/95 p-4 card-shadow sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <InsightStrip
              label="Itens críticos no cockpit"
              value={itensCriticos}
              hint={
                atrasadasCount > 0 && bloqueiosCount > 0
                  ? `${atrasadasCount} em atraso e ${bloqueiosCount} cliente(s) com bloqueio no fechamento — trate atrasos em lote e desbloqueie o mês.`
                  : atrasadasCount > 0
                    ? `${atrasadasCount} tarefa(s) em atraso — selecione, conclua ou reatribua em lote para zerar o risco operacional.`
                    : bloqueiosCount > 0
                      ? `${bloqueiosCount} cliente(s) com pendência no fechamento do mês — abra o fechamento e atualize as obrigações críticas.`
                      : 'Nada crítico agora. Mantenha o ritmo nas tarefas de hoje e nos próximos 7 dias.'
              }
              className="border-0 bg-transparent p-0 shadow-none sm:py-0"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {data.hoje.length > 0 ? (
                <span className="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                  {data.hoje.length} vencem hoje
                </span>
              ) : null}
              {data.proximos7Dias.length > 0 ? (
                <span className="rounded-lg border border-dashed bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                  {data.proximos7Dias.length} nos próximos 7 dias
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {atrasadasCount > 0 ? (
              <Button type="button" onClick={resolverFila}>
                Resolver fila
              </Button>
            ) : null}
            {bloqueiosCount > 0 ? (
              <Link
                href={`/fechamento?mes=${mesAtual}&ano=${anoAtual}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-8 sm:h-9')}
              >
                Abrir fechamento
              </Link>
            ) : null}
            {atrasadasCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 sm:h-9"
                onClick={() => document.getElementById('cockpit-atrasadas')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Ver atrasadas
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div ref={loteRef} id="acoes-lote">
          <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ações em lote ({selectedIds.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void concluirEmLote()}>Concluir selecionadas</Button>
            <select className="h-8 rounded-md border bg-background px-2 text-xs" value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
              <option value="">Reatribuir para...</option>
              {usuariosData.map((u) => <option key={u.id} value={u.id}>{u.nome ?? 'Usuário'}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => void reatribuirEmLote()}>Aplicar responsável</Button>
            <input type="date" className="h-8 rounded-md border bg-background px-2 text-xs" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => void alterarPrazoEmLote()}>Aplicar prazo</Button>
          </CardContent>
        </Card>
        </div>
      )}

      <div className="surface-subtle flex items-center gap-2 border px-3 py-2.5">
        <input
          type="checkbox"
          checked={selectedIds.length > 0 && selectedIds.length === allTaskIds.length}
          onChange={(e) => setSelectedIds(e.target.checked ? allTaskIds : [])}
        />
        <p className="text-sm text-muted-foreground">Selecionar todas as tarefas listadas</p>
      </div>

      <section id="cockpit-atrasadas" className="stack-4">
        <h3 className="text-sm font-semibold">Atrasadas ({data.atrasadas.length})</h3>
        {data.atrasadas.length > 0 && (
          <InlineAlert
            tone="danger"
            title="Trate o atraso antes que vire bloqueio de fechamento"
            description="Ordenação por score de SLA (tipo da tarefa, dias de atraso, prioridade e ausência de responsável). Use Resolver fila para selecionar todas e agir em lote."
          />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sortedAtrasadas.map((task) => (
            <TaskCard key={task.id} task={task} usuarios={usuariosData} selected={selectedIds.includes(task.id)} onToggleSelected={toggleSelected} onUpdated={() => void cockpit.refetch()} />
          ))}
        </div>
      </section>

      <section className="stack-4">
        <h3 className="text-sm font-semibold">Vencem hoje ({data.hoje.length})</h3>
        {data.hoje.length > 0 && (
          <InlineAlert
            tone="warning"
            title="Tarefas vencendo hoje"
            description="A execução destas tarefas no mesmo dia evita acúmulo para o fechamento."
          />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sortTasksBySla(data.hoje).map((task) => (
            <TaskCard key={task.id} task={task} usuarios={usuariosData} selected={selectedIds.includes(task.id)} onToggleSelected={toggleSelected} onUpdated={() => void cockpit.refetch()} />
          ))}
        </div>
      </section>

      <section className="stack-4">
        <h3 className="text-sm font-semibold">Próximos 7 dias ({data.proximos7Dias.length})</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sortTasksBySla(data.proximos7Dias).map((task) => (
            <TaskCard key={task.id} task={task} usuarios={usuariosData} selected={selectedIds.includes(task.id)} onToggleSelected={toggleSelected} onUpdated={() => void cockpit.refetch()} />
          ))}
        </div>
      </section>

      <Card className="border-border/65 bg-card/95 card-shadow">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Bloqueios de fechamento ({data.bloqueiosFechamento.length})</CardTitle>
          {bloqueiosCount > 0 ? (
            <Link
              href={`/fechamento?mes=${mesAtual}&ano=${anoAtual}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 shrink-0')}
            >
              Resolver no fechamento
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1">
          {data.bloqueiosFechamento.slice(0, 20).map((f) => (
            <p key={f.id} className="text-sm">{f.clienteNome ?? 'Cliente'} com pendência no fechamento</p>
          ))}
          {data.bloqueiosFechamento.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem bloqueios críticos no mês atual.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
