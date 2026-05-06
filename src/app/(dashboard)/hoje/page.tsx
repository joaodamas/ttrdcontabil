'use client'

import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate, tsToDate, cn } from '@/lib/utils'
import { bulkAlterarPrazo, bulkConcluirTarefas, bulkReatribuirTarefas } from '@/features/hoje/services'
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

function grupoLabel(grupo: FilaItem['grupo']) {
  if (grupo === 'atrasada') return 'Atrasada'
  if (grupo === 'hoje') return 'Hoje'
  return 'Proximos 7 dias'
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
  item,
  checked,
  onToggle,
}: {
  item: FilaItem
  checked: boolean
  onToggle: () => void
}) {
  const prazo = tsToDate(item.dataPrazo)
  const atraso = diasAtraso(prazo)
  const badge = PRIORIDADE_BADGE[item.prioridade ?? 'normal'] ?? 'outline'

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/35',
        item.grupo === 'atrasada' && 'border-l-4 border-l-destructive',
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
          <Badge variant={item.grupo === 'atrasada' ? 'destructive' : item.grupo === 'hoje' ? 'warning' : 'outline'}>
            {grupoLabel(item.grupo)}
          </Badge>
          <Badge variant={badge}>{PRIORIDADE_LABEL[item.prioridade ?? 'normal'] ?? item.prioridade ?? 'Normal'}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{item.clienteNome ?? 'Sem cliente'}</span>
          <span>{item.responsavelNome ?? 'Sem responsavel'}</span>
          <span>{prazo ? formatDate(prazo) : 'Sem prazo'}</span>
          {atraso > 0 ? <span className="font-medium text-destructive">{atraso} dia(s) em atraso</span> : null}
        </div>
      </div>
      <div className="hidden text-right text-xs text-muted-foreground sm:block">
        <span className="font-mono">SLA {item.score}</span>
      </div>
    </div>
  )
}

export default function HojePage() {
  const queryClient = useQueryClient()
  const [responsavelId, setResponsavelId] = useState('todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkResponsavelId, setBulkResponsavelId] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [saving, setSaving] = useState(false)

  const { cockpit, usuarios, isLoading } = useHojeData(responsavelId === 'todos' ? undefined : responsavelId)
  const fila = useMemo(() => buildFila(cockpit.data), [cockpit.data])
  const usuariosData = (usuarios.data ?? []) as HojeUsuario[]
  const selectedIds = Array.from(selected)

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
          <Button variant="outline" onClick={() => void refresh()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
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
            <div>
              {fila.map((item) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  checked={selected.has(item.id)}
                  onToggle={() => toggle(item.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
