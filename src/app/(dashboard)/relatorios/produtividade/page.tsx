'use client'

import { useState, useEffect, useMemo } from 'react'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import { tsToDate, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, User, TrendingUp, BarChart2 } from 'lucide-react'

type TimerSession = {
  id: string
  tarefaId: string
  tarefaTitulo: string
  usuarioId: string
  usuarioNome: string
  inicioEm: Timestamp
  fimEm: Timestamp
  duracaoMs: number
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(totalSec % 60).padStart(2, '0')}s`
}

const PERIODOS = [
  { value: '7',  label: 'Últimos 7 dias'  },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
]

export default function ProdutividadePage() {
  const [sessions,  setSessions]  = useState<TimerSession[]>([])
  const [loading,   setLoading]   = useState(true)
  const [periodo,   setPeriodo]   = useState('7')
  const [usuFiltro, setUsuFiltro] = useState('todos')

  useEffect(() => {
    const since = new Date()
    since.setDate(since.getDate() - parseInt(periodo))
    const sinceTs = Timestamp.fromDate(since)
    let active = true
    setLoading(true)  // eslint-disable-line react-hooks/set-state-in-effect
    listDocuments<TimerSession>('tarefas_timers', [
      where('inicioEm', '>=', sinceTs),
      orderBy('inicioEm', 'desc'),
      limit(500),
    ])
      .then(data => { if (active) setSessions(data as TimerSession[]) })
      .catch(() => { if (active) setSessions([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [periodo])

  const usuarios = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sessions) map.set(s.usuarioId, s.usuarioNome)
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }))
  }, [sessions])

  const filtradas = useMemo(() =>
    usuFiltro === 'todos' ? sessions : sessions.filter(s => s.usuarioId === usuFiltro),
  [sessions, usuFiltro])

  const porUsuario = useMemo(() => {
    const map = new Map<string, { nome: string; totalMs: number; sessoes: number }>()
    for (const s of filtradas) {
      const prev = map.get(s.usuarioId) ?? { nome: s.usuarioNome, totalMs: 0, sessoes: 0 }
      map.set(s.usuarioId, { nome: s.usuarioNome, totalMs: prev.totalMs + s.duracaoMs, sessoes: prev.sessoes + 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.totalMs - a.totalMs)
  }, [filtradas])

  const porTarefa = useMemo(() => {
    const map = new Map<string, { titulo: string; totalMs: number; sessoes: number }>()
    for (const s of filtradas) {
      const prev = map.get(s.tarefaId) ?? { titulo: s.tarefaTitulo, totalMs: 0, sessoes: 0 }
      map.set(s.tarefaId, { titulo: s.tarefaTitulo, totalMs: prev.totalMs + s.duracaoMs, sessoes: prev.sessoes + 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.totalMs - a.totalMs).slice(0, 10)
  }, [filtradas])

  const totalMs = filtradas.reduce((s, t) => s + t.duracaoMs, 0)
  const maxMs   = porUsuario[0]?.totalMs ?? 1

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Produtividade individual</h1>
          <p className="text-sm text-muted-foreground">Tempo registrado via timer no Cockpit Hoje</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={periodo} onValueChange={v => { if (v) setPeriodo(v) }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={usuFiltro} onValueChange={v => { if (v) setUsuFiltro(v) }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Todos os usuários" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-xl font-bold tabular-nums">{loading ? '—' : formatMs(totalMs)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Sessões</p>
              <p className="text-xl font-bold tabular-nums">{loading ? '—' : filtradas.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Usuários</p>
              <p className="text-xl font-bold tabular-nums">{loading ? '—' : porUsuario.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
              <BarChart2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Média/sessão</p>
              <p className="text-xl font-bold tabular-nums">{loading || filtradas.length === 0 ? '—' : formatMs(Math.round(totalMs / filtradas.length))}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Por usuário */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Tempo por usuário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : porUsuario.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma sessão registrada neste período.</p>
            ) : porUsuario.map(u => (
              <div key={u.nome} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[180px]">{u.nome}</span>
                  <span className="tabular-nums text-muted-foreground">{formatMs(u.totalMs)} · {u.sessoes} sess.</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((u.totalMs / maxMs) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top tarefas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Top 10 tarefas por tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2" />)
            ) : porTarefa.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma sessão registrada neste período.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {porTarefa.map((t, i) => (
                  <div key={t.titulo + i} className="flex items-center gap-3 py-2">
                    <span className="w-5 text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <p className="flex-1 min-w-0 truncate text-sm">{t.titulo || 'Tarefa sem título'}</p>
                    <span className={cn(
                      'shrink-0 text-xs font-semibold tabular-nums',
                      i === 0 ? 'text-primary' : 'text-muted-foreground'
                    )}>{formatMs(t.totalMs)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sessões recentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sessões recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Tarefa</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Usuário</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Duração</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Início</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtradas.slice(0, 30).map(s => (
                    <tr key={s.id} className="hover:bg-muted/25">
                      <td className="px-4 py-2 max-w-[200px] truncate">{s.tarefaTitulo || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{s.usuarioNome}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMs(s.duracaoMs)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {tsToDate(s.inicioEm)?.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
