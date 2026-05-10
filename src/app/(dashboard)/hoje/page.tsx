'use client'

import React, { useMemo, useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FolderOpen,
  Loader2,
  RefreshCw,
  UserRound,
  Users,
  Zap,
  ShieldAlert,
  LayoutList,
  Columns2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate, tsToDate, cn } from '@/lib/utils'
import { TaskTimer } from '@/components/tarefas/task-timer'
import { useAuth } from '@/contexts/auth-context'
import { bulkAlterarPrazo, bulkConcluirTarefas, bulkReatribuirTarefas } from '@/features/hoje/services'
import { updateDocument } from '@/lib/firestore-client'
import { Timestamp } from 'firebase/firestore'
import { hojeKeys } from '@/features/hoje/queries'
import { useHojeData } from '@/features/hoje/hooks'
import type { HojeTask, HojeUsuario } from '@/features/hoje/types'

type FilaItem = HojeTask & {
  grupo: 'atrasada' | 'hoje' | 'proximos'
  score: number
}

const PRIORIDADE_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

const PRIORIDADE_BADGE: Record<string, 'destructive' | 'warning' | 'outline' | 'secondary'> = {
  urgente: 'destructive',
  alta: 'warning',
  normal: 'outline',
  baixa: 'secondary',
}

function prioridadePeso(prioridade?: string) {
  if (prioridade === 'urgente') return 4
  if (prioridade === 'alta') return 3
  if (prioridade === 'normal') return 2
  return 1
}

function diasAtraso(data: Date | null) {
  if (!data) return 0
  const hoje = new Date()
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const inicioData = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  return Math.max(0, Math.floor((inicioHoje.getTime() - inicioData.getTime()) / 86400000))
}

function scoreTask(task: HojeTask, grupo: FilaItem['grupo']) {
  const prazo = tsToDate(task.dataPrazo)
  const atraso = diasAtraso(prazo)
  const atrasoPeso = atraso >= 3 ? atraso + 3 : atraso
  const grupoPeso = grupo === 'atrasada' ? 8 : grupo === 'hoje' ? 5 : 1
  const semResponsavel = task.responsavelId ? 0 : 2
  return grupoPeso + atrasoPeso + prioridadePeso(task.prioridade) + semResponsavel
}

function buildFila(data: ReturnType<typeof useHojeData>['cockpit']['data']): FilaItem[] {
  if (!data) return []
  return [
    ...data.atrasadas.map((t) => ({ ...t, grupo: 'atrasada' as const, score: scoreTask(t, 'atrasada') })),
    ...data.hoje.map((t) => ({ ...t, grupo: 'hoje' as const, score: scoreTask(t, 'hoje') })),
    ...data.proximos7Dias.map((t) => ({ ...t, grupo: 'proximos' as const, score: scoreTask(t, 'proximos') })),
  ].sort((a, b) => b.score - a.score)
}

const GRUPO_LABEL: Record<FilaItem['grupo'], string> = {
  atrasada: 'Atrasadas',
  hoje:     'Para hoje',
  proximos: 'Próximos 7 dias',
}

const GRUPO_COLOR: Record<FilaItem['grupo'], string> = {
  atrasada: 'text-destructive',
  hoje:     'text-warning',
  proximos: 'text-muted-foreground',
}


function EmptyCockpit() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-success/70" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Nenhuma tarefa acionavel para hoje</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Se este ambiente ainda esta sendo preparado, comece vinculando servicos aos clientes,
            gerando competencias do mes e criando tarefas com responsavel e prazo.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/clientes">
            <Button variant="outline">Ver clientes</Button>
          </Link>
          <Link href="/competencias/nova">
            <Button variant="outline">Criar competencia</Button>
          </Link>
          <Link href="/tarefas/nova">
            <Button>Nova tarefa</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function TaskRow({
  item, checked, onToggle, usuarios, onAssign, usuarioId, usuarioNome,
}: {
  item: FilaItem
  checked: boolean
  onToggle: () => void
  usuarios: HojeUsuario[]
  onAssign: (tarefaId: string, userId: string, userName: string) => void
  usuarioId: string
  usuarioNome: string
}) {
  const prazo = tsToDate(item.dataPrazo)
  const atraso = diasAtraso(prazo)
  const badge = PRIORIDADE_BADGE[item.prioridade ?? 'normal'] ?? 'outline'
  const semResponsavel = !item.responsavelId
  const [editingPrazo, setEditingPrazo] = useState(false)
  const [savingPrazo,  setSavingPrazo]  = useState(false)

  async function handlePrazoChange(isoDate: string) {
    if (!isoDate) { setEditingPrazo(false); return }
    setSavingPrazo(true)
    try {
      const dataPrazo = Timestamp.fromDate(new Date(isoDate + 'T00:00:00'))
      await updateDocument('tarefas', item.id, { dataPrazo })
      toast.success('Prazo atualizado.')
    } catch { toast.error('Não foi possível alterar o prazo.') }
    finally { setSavingPrazo(false); setEditingPrazo(false) }
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/35 transition-colors',
        item.grupo === 'atrasada' && 'border-l-4 border-l-destructive bg-destructive/2',
        item.grupo === 'hoje' && 'border-l-4 border-l-warning',
        item.grupo === 'proximos' && 'border-l-4 border-l-border'
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/tarefas/${item.id}`} className="font-medium hover:underline">
            {item.titulo ?? 'Tarefa sem titulo'}
          </Link>
          <Badge variant={badge}>{PRIORIDADE_LABEL[item.prioridade ?? 'normal'] ?? item.prioridade ?? 'Normal'}</Badge>
          {semResponsavel && usuarios.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors">
                <Users className="h-2.5 w-2.5" />atribuir
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {usuarios.map(u => (
                  <DropdownMenuItem key={u.id} onClick={() => onAssign(item.id, u.id, u.nome ?? u.id)}>
                    {u.nome ?? u.id}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : semResponsavel ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              <Users className="h-2.5 w-2.5 mr-1" />sem responsável
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{item.clienteNome ?? 'Sem cliente'}</span>
          {!semResponsavel && <span>{item.responsavelNome}</span>}
          {editingPrazo ? (
            <input
              type="date"
              autoFocus
              defaultValue={prazo ? prazo.toISOString().slice(0, 10) : ''}
              disabled={savingPrazo}
              onBlur={e => void handlePrazoChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handlePrazoChange((e.target as HTMLInputElement).value)
                if (e.key === 'Escape') setEditingPrazo(false)
              }}
              className="rounded border border-primary px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            />
          ) : (
            <button
              type="button"
              title="Clique para editar prazo"
              onClick={() => setEditingPrazo(true)}
              className={cn(
                'hover:text-primary hover:underline underline-offset-2 transition-colors',
                atraso > 0 ? 'text-destructive font-medium' : ''
              )}
            >
              {prazo ? formatDate(prazo) : 'Sem prazo'}
            </button>
          )}
          {atraso > 0 && !editingPrazo ? <span className="font-medium text-destructive">{atraso} dia(s) em atraso</span> : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="hidden font-mono text-[10px] tabular-nums text-muted-foreground/60 sm:inline">#{item.score}</span>
        <TaskTimer
          tarefaId={item.id}
          tarefaTitulo={item.titulo ?? ''}
          usuarioId={usuarioId}
          usuarioNome={usuarioNome}
        />
      </div>
    </div>
  )
}

type FlatRow =
  | { kind: 'header'; grupo: FilaItem['grupo']; count: number }
  | { kind: 'task';   item: FilaItem }

function buildFlatRows(fila: FilaItem[]): FlatRow[] {
  const rows: FlatRow[] = []
  let lastGrupo: FilaItem['grupo'] | null = null
  for (const item of fila) {
    if (item.grupo !== lastGrupo) {
      rows.push({ kind: 'header', grupo: item.grupo, count: fila.filter(f => f.grupo === item.grupo).length })
      lastGrupo = item.grupo
    }
    rows.push({ kind: 'task', item })
  }
  return rows
}

function VirtualTaskList({
  fila, selected, toggle, usuariosData, quickAssign, usuarioId, usuarioNome,
}: {
  fila: FilaItem[]
  selected: Set<string>
  toggle: (id: string) => void
  usuariosData: HojeUsuario[]
  quickAssign: (id: string, uid: string, uname: string) => Promise<void>
  usuarioId: string
  usuarioNome: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => buildFlatRows(fila), [fila])

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === 'header' ? 36 : 72),
    overscan: 8,
  })

  return (
    <div ref={parentRef} className="max-h-[600px] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vRow => {
          const row = rows[vRow.index]
          return (
            <div
              key={vRow.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
            >
              {row.kind === 'header' ? (
                <div className={cn(
                  'flex items-center gap-2 border-b bg-muted/30 px-4 py-2',
                  vRow.index > 0 && 'border-t'
                )}>
                  <span className={cn('text-xs font-semibold uppercase tracking-wide', GRUPO_COLOR[row.grupo])}>
                    {GRUPO_LABEL[row.grupo]}
                  </span>
                  <span className="text-xs text-muted-foreground">— {row.count} tarefa(s)</span>
                </div>
              ) : (
                <TaskRow
                  item={row.item}
                  checked={selected.has(row.item.id)}
                  onToggle={() => toggle(row.item.id)}
                  usuarios={usuariosData}
                  onAssign={(id, uid, uname) => void quickAssign(id, uid, uname)}
                  usuarioId={usuarioId}
                  usuarioNome={usuarioNome}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HojePage() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const [responsavelId, setResponsavelId] = useState('todos')
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<string>('todos')
  const [modoFoco, setModoFoco] = useState(false)
  const [modoView, setModoView] = useState<'lista' | 'kanban'>('lista')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkResponsavelId, setBulkResponsavelId] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [saving, setSaving] = useState(false)

  const { cockpit, usuarios, isLoading } = useHojeData(responsavelId === 'todos' ? undefined : responsavelId)
  const filaBase = useMemo(() => buildFila(cockpit.data), [cockpit.data])
  const fila = useMemo(() => {
    let result = filaBase
    if (prioridadeFiltro !== 'todos') result = result.filter(i => (i.prioridade ?? 'normal') === prioridadeFiltro)
    if (modoFoco) result = result.filter(i => i.grupo === 'atrasada' || i.grupo === 'hoje')
    return result
  }, [filaBase, prioridadeFiltro, modoFoco])
  const usuariosData = (usuarios.data ?? []) as HojeUsuario[]
  const selectedIds = Array.from(selected)
  const semResponsavelCount = filaBase.filter(i => !i.responsavelId).length

  // Gargalos operacionais
  const semPrazo     = filaBase.filter(i => !i.dataPrazo && i.grupo !== 'atrasada').length
  const riscoSla     = filaBase.filter(i => i.grupo === 'hoje' && i.score >= 55).length
  const gargalos = [
    semResponsavelCount > 0 && { id: 'sem-resp',  icon: Users,       cor: 'text-destructive', texto: `${semResponsavelCount} tarefa${semResponsavelCount !== 1 ? 's' : ''} sem responsável`,      acao: 'Atribuir' },
    semPrazo > 0            && { id: 'sem-prazo', icon: CalendarClock, cor: 'text-warning',    texto: `${semPrazo} tarefa${semPrazo !== 1 ? 's' : ''} sem prazo definido`,                         acao: 'Definir prazo' },
    riscoSla > 0            && { id: 'sla',        icon: ShieldAlert,  cor: 'text-warning',    texto: `${riscoSla} tarefa${riscoSla !== 1 ? 's' : ''} com SLA em risco hoje`,                       acao: 'Ver fila' },
  ].filter(Boolean) as Array<{ id: string; icon: React.ComponentType<{className?: string}>; cor: string; texto: string; acao: string }>

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === fila.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(fila.map((item) => item.id)))
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: hojeKeys.all })
  }

  async function quickAssign(tarefaId: string, userId: string, userName: string) {
    try {
      await bulkReatribuirTarefas([tarefaId], userId, userName)
      toast.success(`Tarefa atribuída a ${userName}.`)
      await refresh()
    } catch {
      toast.error('Não foi possível atribuir a tarefa.')
    }
  }

  async function runBulk(action: 'concluir' | 'reatribuir' | 'prazo') {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos uma tarefa.')
      return
    }
    setSaving(true)
    try {
      if (action === 'concluir') {
        await bulkConcluirTarefas(selectedIds)
        toast.success(`${selectedIds.length} tarefa(s) concluida(s).`)
      }
      if (action === 'reatribuir') {
        const usuario = usuariosData.find((u) => u.id === bulkResponsavelId)
        if (!usuario?.id) {
          toast.error('Selecione o responsavel.')
          return
        }
        await bulkReatribuirTarefas(selectedIds, usuario.id, usuario.nome ?? 'Responsavel')
        toast.success(`${selectedIds.length} tarefa(s) reatribuida(s).`)
      }
      if (action === 'prazo') {
        if (!bulkDate) {
          toast.error('Informe a nova data.')
          return
        }
        await bulkAlterarPrazo(selectedIds, bulkDate)
        toast.success(`Prazo alterado em ${selectedIds.length} tarefa(s).`)
      }
      setSelected(new Set())
      await refresh()
    } catch (err) {
      console.error(err)
      toast.error('Nao foi possivel executar a acao em lote.')
    } finally {
      setSaving(false)
    }
  }

  const bloqueios = cockpit.data?.bloqueiosFechamento ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hoje</h1>
          <p className="text-sm text-muted-foreground">Fila operacional priorizada por prazo, prioridade e responsavel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setModoView('lista')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors', modoView === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
            >
              <LayoutList className="h-3.5 w-3.5" />Lista
            </button>
            <button
              type="button"
              onClick={() => setModoView('kanban')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors', modoView === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
            >
              <Columns2 className="h-3.5 w-3.5" />Kanban
            </button>
          </div>
          <Button
            variant={modoFoco ? 'default' : 'outline'}
            size="sm"
            onClick={() => setModoFoco(v => !v)}
          >
            <Zap className="h-3.5 w-3.5" />
            {modoFoco ? 'Modo foco ativo' : 'Modo foco'}
          </Button>
          <Select value={responsavelId} onValueChange={(value) => setResponsavelId(value ?? 'todos')}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Equipe inteira</SelectItem>
              {usuariosData.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome ?? u.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros de prioridade */}
      <div className="flex flex-wrap gap-1.5">
        {(['todos', 'urgente', 'alta', 'normal', 'baixa'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrioridadeFiltro(p)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              prioridadeFiltro === p
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            {p === 'todos' ? 'Todas' : PRIORIDADE_LABEL[p] ?? p}
          </button>
        ))}
        {semResponsavelCount > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/8 px-3 py-1 text-xs font-medium text-destructive">
            <Users className="h-3 w-3" />{semResponsavelCount} sem responsável
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Atrasadas</p>
              <p className="text-2xl font-bold text-destructive">{cockpit.data?.atrasadas.length ?? 0}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Hoje</p>
              <p className="text-2xl font-bold text-warning">{cockpit.data?.hoje.length ?? 0}</p>
            </div>
            <CalendarClock className="h-5 w-5 text-warning" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Proximos 7 dias</p>
              <p className="text-2xl font-bold">{cockpit.data?.proximos7Dias.length ?? 0}</p>
            </div>
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Bloqueios fechamento</p>
              <p className="text-2xl font-bold">{bloqueios.length}</p>
            </div>
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {bloqueios.length > 0 ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-warning">
              <FolderOpen className="h-4 w-4" />
              Bloqueios do fechamento mensal
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {bloqueios.slice(0, 12).map((b) => (
              <Link key={b.id} href="/fechamento">
                <Badge variant="warning">{b.clienteNome ?? b.id}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Gargalos operacionais */}
      {gargalos.length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-destructive/15 px-4 py-2.5">
            <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="text-xs font-semibold text-destructive">Gargalos operacionais</span>
          </div>
          <div className="divide-y divide-destructive/10">
            {gargalos.map(g => {
              const Icon = g.icon
              return (
                <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className={`h-4 w-4 shrink-0 ${g.cor}`} />
                  <p className="flex-1 text-xs text-muted-foreground">{g.texto}</p>
                  <Link href="/hoje" className="text-[11px] font-medium text-primary hover:underline shrink-0">{g.acao}</Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Kanban view */}
      {modoView === 'kanban' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {([
            { grupo: 'atrasada' as const, label: 'Atrasadas',   cor: 'border-destructive/30 bg-destructive/5', header: 'text-destructive' },
            { grupo: 'hoje'    as const, label: 'Para hoje',    cor: 'border-warning/30 bg-warning/5',         header: 'text-warning'     },
            { grupo: 'proximos' as const, label: 'Próximos 7d', cor: 'border-border bg-muted/20',               header: 'text-muted-foreground' },
          ] as const).map(col => {
            const colItems = fila.filter(i => i.grupo === col.grupo)
            return (
              <div key={col.grupo} className={`rounded-xl border overflow-hidden ${col.cor}`}>
                <div className={`flex items-center justify-between px-4 py-2.5 border-b ${col.cor}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${col.header}`}>{col.label}</span>
                  <span className={`text-xs font-bold tabular-nums ${col.header}`}>{colItems.length}</span>
                </div>
                <div className="divide-y divide-border/50 max-h-[520px] overflow-y-auto">
                  {colItems.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma tarefa</p>
                  ) : colItems.map(item => {
                    const pr = tsToDate(item.dataPrazo)
                    const atr = diasAtraso(pr)
                    return (
                      <div key={item.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggle(item.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <Link href={`/tarefas/${item.id}`} className="text-xs font-medium hover:underline leading-tight line-clamp-2">
                            {item.titulo ?? 'Tarefa'}
                          </Link>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.clienteNome ?? '—'}</p>
                          {atr > 0 && <p className="text-[11px] font-medium text-destructive">{atr}d atraso</p>}
                          {!item.responsavelId && usuariosData.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="mt-1 text-[10px] text-destructive border border-destructive/30 rounded px-1.5 py-0.5 hover:bg-destructive/10">atribuir</DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {usuariosData.map(u => (
                                  <DropdownMenuItem key={u.id} onClick={() => void quickAssign(item.id, u.id, u.nome ?? u.id)}>
                                    {u.nome ?? u.id}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modoView === 'lista' && (
      <Card>
        <CardHeader className="gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Fila de execucao
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Checkbox
                checked={fila.length > 0 && selected.size === fila.length}
                onCheckedChange={toggleAll}
              />
              <span className="text-muted-foreground">{selected.size} selecionada(s)</span>
            </div>
          </div>
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void runBulk('concluir')} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Concluir
              </Button>
              <Select value={bulkResponsavelId} onValueChange={(value) => setBulkResponsavelId(value ?? '')}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Novo responsavel" />
                </SelectTrigger>
                <SelectContent>
                  {usuariosData.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome ?? u.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void runBulk('reatribuir')} disabled={saving}>
                <UserRound className="h-4 w-4" />
                Reatribuir
              </Button>
              <Input
                type="date"
                value={bulkDate}
                onChange={(event) => setBulkDate(event.target.value)}
                className="w-40"
              />
              <Button variant="outline" onClick={() => void runBulk('prazo')} disabled={saving}>
                <CalendarClock className="h-4 w-4" />
                Alterar prazo
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : fila.length === 0 ? (
            <EmptyCockpit />
          ) : (
            <VirtualTaskList
              fila={fila}
              selected={selected}
              toggle={toggle}
              usuariosData={usuariosData}
              quickAssign={quickAssign}
              usuarioId={usuario?.uid ?? ''}
              usuarioNome={usuario?.nome ?? usuario?.email ?? ''}
            />
          )}
        </CardContent>
      </Card>
      )}
    </div>
  )
}
