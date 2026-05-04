'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import { formatCurrency, formatDate, formatMesAno , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Users,
  ClipboardList,
  CheckSquare,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'

/* ─── Skeleton ─────────────────────────────────────────────── */
function SkeletonKPI() {
  return (
    <div className="bg-card card-shadow rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-3 w-28 bg-muted rounded-full" />
        <div className="w-10 h-10 bg-muted rounded-xl shrink-0" />
      </div>
      <div className="h-9 w-24 bg-muted rounded-lg mb-2" />
      <div className="h-3 w-20 bg-muted rounded-full" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="bg-card card-shadow rounded-2xl overflow-hidden animate-pulse">
      <div className="px-5 py-4 border-b border-border flex justify-between items-center">
        <div className="h-4 w-36 bg-muted rounded-full" />
        <div className="h-3 w-16 bg-muted rounded-full" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-5 py-3.5 border-b border-border/50 last:border-0 flex gap-3 items-start">
          <div className="w-2 h-2 rounded-full bg-muted mt-1.5 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 bg-muted rounded-full" />
            <div className="h-3 w-24 bg-muted rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Status config ─────────────────────────────────────────── */
const COMP_STATUS: Record<string, { label: string }> = {
  aberta:       { label: 'Abertas' },
  em_andamento: { label: 'Em andamento' },
  concluida:    { label: 'Concluídas' },
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function DashboardPage() {
  const hoje = new Date()
  const mesAtual  = hoje.getMonth() + 1
  const anoAtual  = hoje.getFullYear()
  const mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1
  const anoAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual

  const [loading, setLoading]                               = useState(true)
  const [totalClientesAtivos, setTotalClientesAtivos]       = useState(0)
  const [compCounts, setCompCounts]                         = useState<Record<string, number>>({})
  const [tarefasPendentes, setTarefasPendentes]             = useState(0)
  const [somaVencendo, setSomaVencendo]                     = useState(0)
  const [vencendoCount, setVencendoCount]                   = useState(0)
  const [somaAtrasados, setSomaAtrasados]                   = useState(0)
  const [atrasadosCount, setAtrasadosCount]                 = useState(0)
  const [tarefasVencidas, setTarefasVencidas]               = useState<Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>>([])
  const [competenciasAbertas, setCompetenciasAbertas]       = useState<Array<{ id: string; clienteNome?: string; mes: number; ano: number }>>([])
  const [lancamentosVencidos, setLancamentosVencidos]       = useState<Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>>([])

  useEffect(() => {
    const em7Dias  = new Date(hoje); em7Dias.setDate(hoje.getDate() + 7)
    const hojeTs   = Timestamp.fromDate(hoje)
    const em7DiasTs = Timestamp.fromDate(em7Dias)

    // Use Promise.allSettled so one failing query doesn't break everything
    Promise.allSettled([
      listDocuments('clientes',     [where('status', '==', 'ativo')]),
      listDocuments('competencias', [where('mes', '==', mesAtual), where('ano', '==', anoAtual)]),
      // Uma query de tarefas pendentes para alimentar KPI + lista de vencidas
      listDocuments('tarefas',      [where('status', 'in', ['pendente', 'em_andamento']), orderBy('dataPrazo', 'asc')]),
      listDocuments('lancamentos',  [where('tipo', '==', 'receita'), where('status', '==', 'pendente'), where('dataVencimento', '>=', hojeTs), where('dataVencimento', '<=', em7DiasTs)]),
      listDocuments('lancamentos',  [where('tipo', '==', 'receita'), where('status', '==', 'pendente'), where('dataVencimento', '<', hojeTs)]),
      listDocuments('competencias', [where('mes', '==', mesAnterior), where('ano', '==', anoAnterior), where('status', '==', 'aberta'), limit(5)]),
      listDocuments('lancamentos',  [where('tipo', '==', 'receita'), where('status', '==', 'pendente'), where('dataVencimento', '<', hojeTs), orderBy('dataVencimento', 'asc'), limit(5)]),
    ]).then((results) => {
      function get<T>(idx: number): T[] {
        const r = results[idx]
        return r.status === 'fulfilled' ? (r as PromiseFulfilledResult<unknown[]>).value as T[] : []
      }

      const clientesData       = get<Record<string, unknown>>(0)
      const compMesData        = get<Record<string, unknown>>(1)
      const tarefasData        = get<Record<string, unknown>>(2)
      const vencendoData       = get<Record<string, unknown>>(3)
      const atrasadosData      = get<Record<string, unknown>>(4)
      const compAbertasData    = get<Record<string, unknown>>(5)
      const lancVencidosData   = get<Record<string, unknown>>(6)

      setTotalClientesAtivos(clientesData.length)

      const counts: Record<string, number> = {}
      compMesData.forEach((d) => { const s = d.status as string; counts[s] = (counts[s] ?? 0) + 1 })
      setCompCounts(counts)

      setTarefasPendentes(tarefasData.length)

      setSomaVencendo(vencendoData.reduce((acc, d) => acc + ((d.valor as number) ?? 0), 0))
      setVencendoCount(vencendoData.length)
      setSomaAtrasados(atrasadosData.reduce((acc, d) => acc + ((d.valor as number) ?? 0), 0))
      setAtrasadosCount(atrasadosData.length)

      // Filter overdue tasks client-side
      const vencidas = tarefasData.filter((t) => {
        if (!t.dataPrazo) return false
        const prazo = tsToDate(t.dataPrazo)
        return prazo != null && prazo < hoje
      }).slice(0, 5)
      setTarefasVencidas(vencidas as Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>)

      setCompetenciasAbertas(compAbertasData as Array<{ id: string; clienteNome?: string; mes: number; ano: number }>)
      setLancamentosVencidos(lancVencidosData as Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>)
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─── Loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-32 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded-full animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1,2,3,4,5].map(i => <SkeletonKPI key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {[1,2,3].map(i => <SkeletonList key={i} />)}
        </div>
      </div>
    )
  }

  /* ─── Render ────────────────────────────────────────────── */
  return (
    <div className="space-y-7">

      {/* ── Page header ──────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* ── KPI cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">

        {/* Clientes */}
        <Link href="/clientes?status=ativo" className="group">
          <div className="h-full cursor-pointer rounded-2xl border border-border/65 bg-card/95 p-5 transition-all duration-200 card-shadow hover:-translate-y-0.5 hover:border-primary/35 hover:card-shadow-hover">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clientes Ativos</span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="kpi-value">{totalClientesAtivos}</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 group-hover:text-primary transition-colors">
              Ver todos <ArrowRight className="w-3 h-3" />
            </p>
          </div>
        </Link>

        {/* Competências */}
        <Link href={`/competencias?mes=${mesAtual}&ano=${anoAtual}`} className="group">
          <div className="h-full cursor-pointer rounded-2xl border border-border/65 bg-card/95 p-5 transition-all duration-200 card-shadow hover:-translate-y-0.5 hover:border-primary/35 hover:card-shadow-hover">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Competências</span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(COMP_STATUS).map(([key, { label }]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <Badge variant={key === 'aberta' ? 'neutral' : key === 'em_andamento' ? 'warning' : 'success'} className="text-xs">
                    {label}
                  </Badge>
                  <span className="font-bold tabular-nums">{compCounts[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </Link>

        {/* Tarefas */}
        <Link href="/tarefas?status=pendente" className="group">
          <div className="h-full cursor-pointer rounded-2xl border border-border/65 bg-card/95 p-5 transition-all duration-200 card-shadow hover:-translate-y-0.5 hover:border-primary/35 hover:card-shadow-hover">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tarefas Abertas</span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CheckSquare className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="kpi-value">{tarefasPendentes}</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 group-hover:text-primary transition-colors">
              Ver tarefas <ArrowRight className="w-3 h-3" />
            </p>
          </div>
        </Link>

        {/* A receber */}
        <Link href="/financeiro?status=pendente" className="group">
          <div className="h-full cursor-pointer rounded-2xl border border-border/65 bg-card/95 p-5 transition-all duration-200 card-shadow hover:-translate-y-0.5 hover:border-success/35 hover:card-shadow-hover">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">A Receber (7d)</span>
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
            </div>
            <p className="kpi-value text-success font-mono">
              {formatCurrency(somaVencendo)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">{vencendoCount} lançamento{vencendoCount !== 1 ? 's' : ''}</p>
          </div>
        </Link>

        {/* Em atraso */}
        <Link href="/financeiro?status=atrasado" className="group">
          <div className={cn(
            'h-full cursor-pointer rounded-2xl border bg-card/95 p-5 transition-all duration-200 card-shadow hover:-translate-y-0.5 hover:card-shadow-hover',
            atrasadosCount > 0
              ? 'border-destructive/25 bg-destructive/3 hover:border-destructive/35'
              : 'border-border/60 hover:border-destructive/20'
          )}>
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Em Atraso</span>
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                atrasadosCount > 0 ? 'bg-destructive/15' : 'bg-destructive/8'
              )}>
                <AlertTriangle className={cn('w-5 h-5', atrasadosCount > 0 ? 'text-destructive' : 'text-destructive/50')} />
              </div>
            </div>
            <p className={cn(
              'kpi-value font-mono',
              atrasadosCount > 0 ? 'text-destructive' : 'text-foreground'
            )}>
              {formatCurrency(somaAtrasados)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">{atrasadosCount} lançamento{atrasadosCount !== 1 ? 's' : ''}</p>
          </div>
        </Link>
      </div>

      {/* ── Quick lists ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Tarefas vencidas */}
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <h2 className="text-sm font-semibold">Tarefas Vencidas</h2>
            </div>
            <Link href="/tarefas" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {tarefasVencidas.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma tarefa vencida</p>
            </div>
          ) : (
            <ul>
              {tarefasVencidas.map((t) => (
                <li key={t.id} className="border-b border-border/40 last:border-0">
                  <Link href={`/tarefas/${t.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.clienteNome ?? '—'}</p>
                      {t.dataPrazo && (
                        <p className="text-xs text-destructive mt-0.5 font-medium">Prazo: {formatDate(tsToDate(t.dataPrazo))}</p>
                      )}
                    </div>
                    <Badge variant="destructive" className="shrink-0">atrasada</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Competências abertas mês anterior */}
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <h2 className="text-sm font-semibold">
                Abertas — {formatMesAno(mesAnterior, anoAnterior)}
              </h2>
            </div>
            <Link
              href={`/competencias?mes=${mesAnterior}&ano=${anoAnterior}&status=aberta`}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {competenciasAbertas.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma competência em aberto</p>
            </div>
          ) : (
            <ul>
              {competenciasAbertas.map((c) => (
                <li key={c.id} className="border-b border-border/40 last:border-0">
                  <Link href={`/competencias/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.clienteNome ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{formatMesAno(c.mes, c.ano)}</p>
                    </div>
                    <Badge variant="warning" className="text-xs shrink-0">
                      aberta
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lançamentos vencidos */}
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <h2 className="text-sm font-semibold">Lançamentos Vencidos</h2>
            </div>
            <Link href="/financeiro?status=pendente" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {lancamentosVencidos.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum lançamento vencido</p>
            </div>
          ) : (
            <ul>
              {lancamentosVencidos.map((l) => (
                <li key={l.id} className="border-b border-border/40 last:border-0">
                  <Link href="/financeiro" className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{l.descricao}</p>
                      <p className="text-xs text-muted-foreground truncate">{l.clienteNome ?? '—'}</p>
                      <p className="text-xs text-destructive mt-0.5 font-medium">Venc.: {formatDate(tsToDate(l.dataVencimento))}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(l.valor)}</span>
                      <Badge variant="destructive">vencido</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Quick access ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { href: '/clientes/novo',     label: 'Novo Cliente' },
          { href: '/competencias/nova', label: 'Nova Competência' },
          { href: '/tarefas/nova',      label: 'Nova Tarefa' },
          { href: '/financeiro/novo',   label: 'Novo Lançamento' },
        ] as const).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full justify-start gap-2' })}
          >
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
