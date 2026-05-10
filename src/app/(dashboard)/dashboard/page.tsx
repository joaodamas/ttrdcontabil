'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getDocument, listDocuments } from '@/lib/firestore-client'
import { getFirebaseApp } from '@/lib/firebase'
import { appConfig } from '@/lib/app-config'
import { useAuth } from '@/contexts/auth-context'
import { useFeatureFlags } from '@/contexts/feature-flags-context'
import { formatCurrency, formatDate, formatMesAno, tsToDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Users, ClipboardList, CheckSquare, TrendingUp,
  AlertTriangle, ArrowRight, CheckCircle2, DollarSign,
  Receipt, Bell, CalendarClock, WalletCards, Gauge, BarChart2, Sparkles,
} from 'lucide-react'

/* ─── Skeleton ──────────────────────────────────────────────────────────── */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 animate-pulse', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-24 bg-muted rounded-full" />
        <div className="h-9 w-9 rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-20 bg-muted rounded-lg mb-2" />
      <div className="h-3 w-16 bg-muted rounded-full" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="px-5 py-3.5 border-b flex justify-between items-center">
        <div className="h-4 w-32 bg-muted rounded-full" />
        <div className="h-3 w-14 bg-muted rounded-full" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-5 py-3 border-b last:border-0 flex gap-3 items-center">
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 bg-muted rounded-full" />
            <div className="h-3 w-24 bg-muted rounded-full" />
          </div>
          <div className="h-5 w-14 bg-muted rounded-full" />
        </div>
      ))}
    </div>
  )
}

/* ─── Competências status ───────────────────────────────────────────────── */
const COMP_STATUS: Record<string, { label: string; variant: 'neutral' | 'warning' | 'success' }> = {
  aberta:       { label: 'Abertas',      variant: 'neutral' },
  em_andamento: { label: 'Em andamento', variant: 'warning' },
  concluida:    { label: 'Concluídas',   variant: 'success' },
}

type DashboardKpis = {
  id?: string
  totalClientesAtivos?: number
  compCounts?: Record<string, number>
  tarefasPendentes?: number
  somaVencendo?: number
  vencendoCount?: number
  somaAtrasados?: number
  atrasadosCount?: number
}

function applyKpis(
  kpis: DashboardKpis,
  setters: {
    setTotalClientesAtivos: (value: number) => void
    setCompCounts: (value: Record<string, number>) => void
    setTarefasPendentes: (value: number) => void
    setSomaVencendo: (value: number) => void
    setVencendoCount: (value: number) => void
    setSomaAtrasados: (value: number) => void
    setAtrasadosCount: (value: number) => void
  }
) {
  setters.setTotalClientesAtivos(kpis.totalClientesAtivos ?? 0)
  setters.setCompCounts(kpis.compCounts ?? {})
  setters.setTarefasPendentes(kpis.tarefasPendentes ?? 0)
  setters.setSomaVencendo(kpis.somaVencendo ?? 0)
  setters.setVencendoCount(kpis.vencendoCount ?? 0)
  setters.setSomaAtrasados(kpis.somaAtrasados ?? 0)
  setters.setAtrasadosCount(kpis.atrasadosCount ?? 0)
}

async function recalcularDashboardKpis(params: { mes: number; ano: number }) {
  const fn = httpsCallable<{ mes: number; ano: number }, DashboardKpis>(
    getFunctions(getFirebaseApp(), 'southamerica-east1'),
    'recalcularDashboardKpis'
  )
  const { data } = await fn(params)
  return data
}

type ClienteRisco = {
  id: string
  razaoSocial: string
  motivos: string[]
  score: number
}

type DashboardV2Props = {
  hoje: Date
  mesAtual: number
  anoAtual: number
  mesAnterior: number
  anoAnterior: number
  totalClientesAtivos: number
  compCounts: Record<string, number>
  tarefasPendentes: number
  somaVencendo: number
  vencendoCount: number
  somaAtrasados: number
  atrasadosCount: number
  tarefasVencidas: Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>
  competenciasAbertas: Array<{ id: string; clienteNome?: string; mes: number; ano: number }>
  lancamentosVencidos: Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>
  alertasNFSe: Array<{ id: string; razaoSocial: string; diaEmissaoNFSe: number; diasRestantes: number }>
  clientesEmRisco: ClienteRisco[]
  completedByDay: Record<number, number>
  totalFechamentos: number
}

function CurvaSFechamento({
  completedByDay,
  totalFechamentos,
  hoje,
}: {
  completedByDay: Record<number, number>
  totalFechamentos: number
  hoje: Date
}) {
  if (totalFechamentos === 0) return null
  const diaAtual = hoje.getDate()
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const W = 240, H = 80
  const PAD = 4

  // Build cumulative actual line
  let cumul = 0
  const actualPoints: Array<[number, number]> = [[0, H - PAD]]
  for (let d = 1; d <= diaAtual; d++) {
    cumul += completedByDay[d] ?? 0
    const x = PAD + ((d / diasNoMes) * (W - PAD * 2))
    const y = H - PAD - (cumul / totalFechamentos) * (H - PAD * 2)
    actualPoints.push([x, y])
  }

  // Expected: diagonal from (0,H) to (diaAtual/diasNoMes * W, y_expected)
  const expectedEndX = PAD + ((diaAtual / diasNoMes) * (W - PAD * 2))
  const expectedEndY = H - PAD - (diaAtual / diasNoMes) * (H - PAD * 2)

  const toPath = (pts: Array<[number, number]>) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

  const pctAtual = totalFechamentos > 0 ? Math.round((cumul / totalFechamentos) * 100) : 0
  const pctEsperado = Math.round((diaAtual / diasNoMes) * 100)
  const delta = pctAtual - pctEsperado

  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-4 card-shadow">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Curva-S · Fechamento</h2>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
          delta >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        )}>
          {delta >= 0 ? `+${delta}%` : `${delta}%`} vs meta
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = H - PAD - (pct / 100) * (H - PAD * 2)
          return <line key={pct} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border/50" strokeDasharray="2,3" />
        })}
        {/* Expected line (dashed) */}
        <line x1={PAD} y1={H - PAD} x2={expectedEndX} y2={expectedEndY} stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/40" strokeDasharray="3,3" />
        {/* Actual line */}
        <path d={toPath(actualPoints)} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" strokeLinecap="round" strokeLinejoin="round" />
        {/* Today marker */}
        {actualPoints.length > 1 && (
          <circle cx={actualPoints[actualPoints.length - 1][0]} cy={actualPoints[actualPoints.length - 1][1]} r="3" fill="currentColor" className="text-primary" />
        )}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{cumul} / {totalFechamentos} concluídos</span>
        <span>Dia {diaAtual}/{diasNoMes}</span>
      </div>
      <Link
        href={`/fechamento?mes=${hoje.getMonth() + 1}&ano=${hoje.getFullYear()}`}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        Ver fechamento <ArrowRight className="size-3" />
      </Link>
    </div>
  )
}

function InsightCard({
  title,
  value,
  description,
  href,
  icon: Icon,
  tone = 'neutral',
}: {
  title: string
  value: string | number
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'neutral' | 'danger' | 'warning' | 'success'
}) {
  const toneClass = {
    neutral: 'bg-muted/55 text-foreground',
    danger: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/10 text-success',
  }[tone]

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border/70 bg-card/95 p-4 card-shadow transition-all hover:border-primary/35 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', toneClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary">
        Abrir área <ArrowRight className="size-3" />
      </div>
    </Link>
  )
}

function DashboardV2(props: DashboardV2Props) {
  const totalUrgente = props.tarefasVencidas.length + props.lancamentosVencidos.length + props.alertasNFSe.length
  const competenciasAbertasMes = props.compCounts.aberta ?? 0
  const tarefasCriticas = props.tarefasVencidas.slice(0, 4)
  const financeiroCritico = props.lancamentosVencidos.slice(0, 4)
  const fiscalCritico = props.alertasNFSe.slice(0, 4)
  const totalComp = (props.compCounts.aberta ?? 0) + (props.compCounts.em_andamento ?? 0) + (props.compCounts.concluida ?? 0)
  const pctConcluida = totalComp > 0 ? Math.round(((props.compCounts.concluida ?? 0) / totalComp) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cockpit executivo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">O que precisa acontecer hoje</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {props.hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hoje" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <CalendarClock className="size-3.5" /> Hoje
          </Link>
          <Link href="/fiscal?emitir=1" className={buttonVariants({ size: 'sm' })}>
            <Receipt className="size-3.5" /> Emitir NFS-e
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card/95 p-4 card-shadow">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              totalUrgente > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            )}>
              {totalUrgente > 0 ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {totalUrgente > 0 ? `${totalUrgente} ponto(s) pedem ação` : 'Operação sem alerta crítico imediato'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prioridade calculada por tarefas vencidas, cobranças atrasadas e emissão fiscal próxima.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
            <Link href="/tarefas" className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2 hover:bg-muted/45">
              <p className="text-lg font-bold tabular-nums text-destructive">{props.tarefasVencidas.length}</p>
              <p className="text-[11px] text-muted-foreground">tarefas</p>
            </Link>
            <Link href="/financeiro?status=pendente" className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2 hover:bg-muted/45">
              <p className="text-lg font-bold tabular-nums text-destructive">{props.lancamentosVencidos.length}</p>
              <p className="text-[11px] text-muted-foreground">cobranças</p>
            </Link>
            <Link href="/fiscal" className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2 hover:bg-muted/45">
              <p className="text-lg font-bold tabular-nums text-warning">{props.alertasNFSe.length}</p>
              <p className="text-[11px] text-muted-foreground">NFS-e</p>
            </Link>
          </div>
        </div>
      </section>

      {(props.tarefasVencidas.length > 0 || props.somaAtrasados > 0 || props.alertasNFSe.length > 0) && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Sparkles className="size-3.5 shrink-0" />
          <span>
            Hoje:
            {props.tarefasVencidas.length > 0 && ` ${props.tarefasVencidas.length} tarefa(s) vencida(s)`}
            {props.tarefasVencidas.length > 0 && (props.somaAtrasados > 0 || props.alertasNFSe.length > 0) && ' ·'}
            {props.somaAtrasados > 0 && ` ${formatCurrency(props.somaAtrasados)} em cobrança`}
            {props.somaAtrasados > 0 && props.alertasNFSe.length > 0 && ' ·'}
            {props.alertasNFSe.length > 0 && ` ${props.alertasNFSe.length} NFS-e a emitir`}
          </span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          title="Clientes ativos"
          value={props.totalClientesAtivos}
          description="Carteira operacional disponível para rotinas mensais."
          href="/clientes?status=ativo"
          icon={Users}
        />
        <InsightCard
          title="Tarefas abertas"
          value={props.tarefasPendentes}
          description={`${props.tarefasVencidas.length} vencida(s) exigem tratamento primeiro.`}
          href="/tarefas?status=pendente"
          icon={CheckSquare}
          tone={props.tarefasVencidas.length > 0 ? 'danger' : 'success'}
        />
        <InsightCard
          title="Recebíveis 7 dias"
          value={formatCurrency(props.somaVencendo)}
          description={`${props.vencendoCount} lançamento(s) previstos para recebimento.`}
          href="/financeiro?status=pendente"
          icon={WalletCards}
          tone="success"
        />
        <InsightCard
          title="Atraso financeiro"
          value={formatCurrency(props.somaAtrasados)}
          description={`${props.atrasadosCount} lançamento(s) já passaram do vencimento.`}
          href="/financeiro?status=atrasado"
          icon={DollarSign}
          tone={props.atrasadosCount > 0 ? 'danger' : 'neutral'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/95 card-shadow">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Fila crítica</h2>
                <p className="text-xs text-muted-foreground">Itens ordenados por impacto operacional imediato.</p>
              </div>
              <Link href="/hoje" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir Hoje</Link>
            </div>
            <div className="divide-y divide-border/70">
              {tarefasCriticas.length === 0 && financeiroCritico.length === 0 && fiscalCritico.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma ação crítica no momento.</div>
              ) : (
                <>
                  {tarefasCriticas.map((item) => (
                    <Link key={`t-${item.id}`} href={`/tarefas/${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/35">
                      <Badge variant="destructive">Tarefa</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.clienteNome ?? 'Sem cliente'}</p>
                      </div>
                      <span className="text-xs text-destructive">{formatDate(tsToDate(item.dataPrazo))}</span>
                    </Link>
                  ))}
                  {financeiroCritico.map((item) => (
                    <Link key={`f-${item.id}`} href="/financeiro?status=pendente" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/35">
                      <Badge variant="destructive">Cobrança</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.descricao}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.clienteNome ?? 'Sem cliente'}</p>
                      </div>
                      <span className="text-xs font-semibold text-destructive">{formatCurrency(item.valor)}</span>
                    </Link>
                  ))}
                  {fiscalCritico.map((item) => (
                    <Link key={`n-${item.id}`} href={`/fiscal?emitir=1&clienteId=${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/35">
                      <Badge variant="warning">Fiscal</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.razaoSocial}</p>
                        <p className="truncate text-xs text-muted-foreground">Dia de emissão {item.diaEmissaoNFSe}</p>
                      </div>
                      <span className="text-xs text-warning">{item.diasRestantes <= 0 ? 'emitir hoje' : `${item.diasRestantes}d`}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/95 p-4 card-shadow">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Saúde do mês</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Abertas</span>
                  <span className="font-semibold tabular-nums">{competenciasAbertasMes}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${Math.min(100, competenciasAbertasMes * 8)}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Concluídas</span>
                  <span className="font-semibold tabular-nums">{props.compCounts.concluida ?? 0}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success" style={{ width: `${pctConcluida}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                <span className="text-muted-foreground">Execução do mês</span>
                <span className={cn('font-bold tabular-nums', pctConcluida >= 80 ? 'text-success' : pctConcluida >= 50 ? 'text-warning' : 'text-destructive')}>{pctConcluida}%</span>
              </div>
            </div>
            <Link
              href={`/competencias?mes=${props.mesAtual}&ano=${props.anoAtual}`}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-4 w-full' })}
            >
              Ver competências
            </Link>
          </div>

          {/* Ranking clientes em risco */}
          {props.clientesEmRisco.length > 0 && (
            <div className="rounded-2xl border border-border/70 bg-card/95 card-shadow overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
                <BarChart2 className="size-4 text-destructive" />
                <h2 className="text-sm font-semibold">Clientes em risco</h2>
                <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">{props.clientesEmRisco.length}</span>
              </div>
              <div className="divide-y divide-border/70">
                {props.clientesEmRisco.map((c, i) => (
                  <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/35">
                    <span className="text-xs font-bold tabular-nums text-muted-foreground w-4">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{c.razaoSocial}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{c.motivos.join(' · ')}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      c.score >= 3 ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning'
                    )}>{c.score}</span>
                  </Link>
                ))}
              </div>
              <div className="border-t border-border/70 px-4 py-2">
                <Link href="/clientes" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  Ver todos os clientes <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          )}

          {totalComp > 0 && (
            <div className="rounded-2xl border border-border/70 bg-card/95 p-4 card-shadow">
              <div className="mb-4 flex items-center gap-2">
                <BarChart2 className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Produtividade do mês</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="rounded-xl border border-border/70 bg-muted/25 px-2 py-2">
                  <p className="text-lg font-bold tabular-nums text-success">{props.compCounts.concluida ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Concluídas</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/25 px-2 py-2">
                  <p className="text-lg font-bold tabular-nums text-warning">{props.compCounts.em_andamento ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Em andamento</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/25 px-2 py-2">
                  <p className="text-lg font-bold tabular-nums">{props.compCounts.aberta ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Abertas</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className={cn('font-bold tabular-nums', pctConcluida >= 80 ? 'text-success' : pctConcluida >= 50 ? 'text-warning' : 'text-destructive')}>{pctConcluida}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success" style={{ width: `${pctConcluida}%` }} />
                </div>
              </div>
              <Link
                href={`/competencias?mes=${props.mesAtual}&ano=${props.anoAtual}`}
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-4 w-full' })}
              >
                Ver competências
              </Link>
            </div>
          )}

          <CurvaSFechamento
            completedByDay={props.completedByDay}
            totalFechamentos={props.totalFechamentos}
            hoje={props.hoje}
          />

          <div className="rounded-2xl border border-border/70 bg-card/95 p-4 card-shadow">
            <h2 className="text-sm font-semibold">Atalhos executivos</h2>
            <div className="mt-3 grid gap-2">
              <Link href="/clientes/novo" className={buttonVariants({ variant: 'outline', className: 'justify-start' })}>
                <Users className="size-4" /> Novo cliente
              </Link>
              <Link href="/financeiro/novo" className={buttonVariants({ variant: 'outline', className: 'justify-start' })}>
                <TrendingUp className="size-4" /> Novo lançamento
              </Link>
              <Link href="/tarefas/nova" className={buttonVariants({ variant: 'outline', className: 'justify-start' })}>
                <CheckSquare className="size-4" /> Nova tarefa
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { usuario } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const hoje = new Date()
  const mesAtual    = hoje.getMonth() + 1
  const anoAtual    = hoje.getFullYear()
  const mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1
  const anoAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual

  const [loading,              setLoading]              = useState(true)
  const [totalClientesAtivos,  setTotalClientesAtivos]  = useState(0)
  const [compCounts,           setCompCounts]           = useState<Record<string, number>>({})
  const [tarefasPendentes,     setTarefasPendentes]     = useState(0)
  const [somaVencendo,         setSomaVencendo]         = useState(0)
  const [vencendoCount,        setVencendoCount]        = useState(0)
  const [somaAtrasados,        setSomaAtrasados]        = useState(0)
  const [atrasadosCount,       setAtrasadosCount]       = useState(0)
  const [tarefasVencidas,      setTarefasVencidas]      = useState<Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>>([])
  const [competenciasAbertas,  setCompetenciasAbertas]  = useState<Array<{ id: string; clienteNome?: string; mes: number; ano: number }>>([])
  const [lancamentosVencidos,  setLancamentosVencidos]  = useState<Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>>([])
  const [alertasNFSe,          setAlertasNFSe]          = useState<Array<{ id: string; razaoSocial: string; diaEmissaoNFSe: number; diasRestantes: number }>>([])
  const [clientesEmRisco,      setClientesEmRisco]      = useState<ClienteRisco[]>([])
  const [completedByDay,       setCompletedByDay]       = useState<Record<number, number>>({})
  const [totalFechamentos,     setTotalFechamentos]     = useState(0)

  const AVISO_DIAS = 5 // janela de alerta em dias

  useEffect(() => {
    const em7Dias   = new Date(hoje); em7Dias.setDate(hoje.getDate() + 7)
    const hojeTs    = Timestamp.fromDate(hoje)

    async function load() {
      const tenantId = usuario?.tenantId ?? appConfig.tenantId
      const kpiDocId = `${tenantId}_${anoAtual}_${String(mesAtual).padStart(2, '0')}`
      const setters = {
        setTotalClientesAtivos,
        setCompCounts,
        setTarefasPendentes,
        setSomaVencendo,
        setVencendoCount,
        setSomaAtrasados,
        setAtrasadosCount,
      }

      const kpis = await getDocument<DashboardKpis>('dashboard_kpis', kpiDocId).catch(() => null)
      if (kpis) {
        applyKpis(kpis, setters)
      } else {
        const refreshed = await recalcularDashboardKpis({ mes: mesAtual, ano: anoAtual }).catch(() => null)
        if (refreshed) applyKpis(refreshed, setters)
      }

      return Promise.allSettled([
        listDocuments('clientes',     [where('status', '==', 'ativo'), limit(500)]),
        listDocuments('tarefas',      [where('status', 'in', ['pendente', 'em_andamento']), orderBy('dataPrazo', 'asc'), limit(300)]),
        listDocuments('competencias', [where('mes', '==', mesAnterior), where('ano', '==', anoAnterior), where('status', '==', 'aberta'), limit(5)]),
        listDocuments('lancamentos',  [where('tipo', '==', 'receita'), where('status', '==', 'pendente'), where('dataVencimento', '<', hojeTs), orderBy('dataVencimento', 'asc'), limit(5)]),
        listDocuments('fechamentos',  [where('mes', '==', mesAtual), where('ano', '==', anoAtual), limit(300)]),
      ])
    }

    load().then((results) => {
      function get<T>(idx: number): T[] {
        const r = results[idx]
        return r.status === 'fulfilled' ? (r as PromiseFulfilledResult<unknown[]>).value as T[] : []
      }
      const clientesData     = get<Record<string, unknown>>(0)
      const tarefasData      = get<Record<string, unknown>>(1)
      const compAbertasData  = get<Record<string, unknown>>(2)
      const lancVencidosData = get<Record<string, unknown>>(3)
      const fechamentosData  = get<Record<string, unknown>>(4)

      // Curva-S: group completions by day of month
      const DONE_STATUS = new Set(['enviado', 'ok', 'sm'])
      const byDay: Record<number, number> = {}
      for (const f of fechamentosData) {
        if (!DONE_STATUS.has(f.dasStatus as string)) continue
        const updatedAt = tsToDate(f.updatedAt as Parameters<typeof tsToDate>[0])
        if (!updatedAt) continue
        const day = updatedAt.getDate()
        byDay[day] = (byDay[day] ?? 0) + 1
      }
      setCompletedByDay(byDay)
      setTotalFechamentos(fechamentosData.length)

      const vencidas = tarefasData.filter((t) => {
        if (!t.dataPrazo) return false
        const prazo = tsToDate(t.dataPrazo)
        return prazo != null && prazo < hoje
      }).slice(0, 5)
      setTarefasVencidas(vencidas as Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>)
      setCompetenciasAbertas(compAbertasData as Array<{ id: string; clienteNome?: string; mes: number; ano: number }>)
      setLancamentosVencidos(lancVencidosData as Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>)

      // Alertas de NFS-e: clientes com diaEmissaoNFSe próximo
      const diaAtual = hoje.getDate()
      const alertas = clientesData
        .filter(c => typeof c.diaEmissaoNFSe === 'number' && c.status === 'ativo')
        .map(c => {
          const dia = c.diaEmissaoNFSe as number
          // Dias restantes (pode ser negativo = já passou este mês)
          const diasRestantes = dia - diaAtual
          return {
            id: c.id as string,
            razaoSocial: (c.razaoSocial as string) ?? '—',
            diaEmissaoNFSe: dia,
            diasRestantes,
          }
        })
        .filter(a => a.diasRestantes >= -2 && a.diasRestantes <= AVISO_DIAS) // -2 = 2 dias de carência
        .sort((a, b) => a.diasRestantes - b.diasRestantes)
      setAlertasNFSe(alertas)

      // Ranking de clientes em risco: cruza cobranças vencidas + tarefas vencidas
      const riscoMap = new Map<string, ClienteRisco>()
      for (const l of lancVencidosData) {
        const cId = l.clienteId as string | undefined
        const cNome = (l.clienteNome as string | undefined) ?? '—'
        if (!cId) continue
        const entry = riscoMap.get(cId) ?? { id: cId, razaoSocial: cNome, motivos: [], score: 0 }
        if (!entry.motivos.includes('Cobrança vencida')) entry.motivos.push('Cobrança vencida')
        entry.score += 2
        riscoMap.set(cId, entry)
      }
      for (const t of tarefasData) {
        const cId = t.clienteId as string | undefined
        const cNome = (t.clienteNome as string | undefined) ?? '—'
        if (!cId) continue
        const prazo = tsToDate(t.dataPrazo)
        if (!prazo || prazo >= hoje) continue
        const entry = riscoMap.get(cId) ?? { id: cId, razaoSocial: cNome, motivos: [], score: 0 }
        if (!entry.motivos.includes('Tarefa atrasada')) entry.motivos.push('Tarefa atrasada')
        entry.score += 1
        riscoMap.set(cId, entry)
      }
      const risco = Array.from(riscoMap.values()).sort((a, b) => b.score - a.score).slice(0, 5)
      setClientesEmRisco(risco)
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.tenantId])

  /* ─── Loading ─────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-32 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="h-16 rounded-xl border border-border bg-card animate-pulse" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <SkeletonList />
            <SkeletonList />
          </div>
          <div className="lg:col-span-2">
            <SkeletonList />
          </div>
        </div>
      </div>
    )
  }

  const totalUrgente = tarefasVencidas.length + lancamentosVencidos.length

  if (isEnabled('dashboardV2Enabled')) {
    return (
      <DashboardV2
        hoje={hoje}
        mesAtual={mesAtual}
        anoAtual={anoAtual}
        mesAnterior={mesAnterior}
        anoAnterior={anoAnterior}
        totalClientesAtivos={totalClientesAtivos}
        compCounts={compCounts}
        tarefasPendentes={tarefasPendentes}
        somaVencendo={somaVencendo}
        vencendoCount={vencendoCount}
        somaAtrasados={somaAtrasados}
        atrasadosCount={atrasadosCount}
        tarefasVencidas={tarefasVencidas}
        competenciasAbertas={competenciasAbertas}
        lancamentosVencidos={lancamentosVencidos}
        alertasNFSe={alertasNFSe}
        clientesEmRisco={clientesEmRisco}
        completedByDay={completedByDay}
        totalFechamentos={totalFechamentos}
      />
    )
  }

  /* ─── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Urgency banner */}
      {totalUrgente > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">
            {[
              tarefasVencidas.length > 0 && `${tarefasVencidas.length} tarefa${tarefasVencidas.length !== 1 ? 's' : ''} vencida${tarefasVencidas.length !== 1 ? 's' : ''}`,
              lancamentosVencidos.length > 0 && `${lancamentosVencidos.length} cobrança${lancamentosVencidos.length !== 1 ? 's' : ''} em atraso`,
            ].filter(Boolean).join(' · ')}
          </p>
          <span className="ml-auto text-xs text-destructive/70 whitespace-nowrap">Requer atenção</span>
        </div>
      )}

      {/* Alertas de emissão NFS-e */}
      {alertasNFSe.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-warning/20">
            <Bell className="h-3.5 w-3.5 text-warning shrink-0" />
            <p className="text-xs font-semibold text-warning">
              {alertasNFSe.length} cliente{alertasNFSe.length !== 1 ? 's' : ''} com NFS-e a emitir
            </p>
            <Link href="/clientes" className="ml-auto text-xs text-warning hover:text-warning/80 transition-colors flex items-center gap-1">
              Ver clientes <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-warning/10">
            {alertasNFSe.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <Receipt className="h-3.5 w-3.5 text-warning/70 shrink-0" />
                <Link href={`/clientes/${a.id}`} className="text-sm font-medium hover:underline truncate">
                  {a.razaoSocial}
                </Link>
                <span className="ml-auto shrink-0 text-xs tabular-nums font-medium">
                  {a.diasRestantes < 0
                    ? <span className="text-destructive">Dia {a.diaEmissaoNFSe} — atrasada</span>
                    : a.diasRestantes === 0
                      ? <span className="text-warning font-semibold">Hoje (dia {a.diaEmissaoNFSe})</span>
                      : <span className="text-muted-foreground">em {a.diasRestantes} dia{a.diasRestantes !== 1 ? 's' : ''} (dia {a.diaEmissaoNFSe})</span>
                  }
                </span>
                <Link
                  href={`/fiscal?emitir=1&clienteId=${a.id}`}
                  className="shrink-0 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:text-warning hover:bg-warning/20 transition-colors"
                >
                  Emitir
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI — 3 cards principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Clientes */}
        <Link href="/clientes?status=ativo" className="group rounded-xl border border-border bg-card p-5 card-shadow hover:border-primary/30 hover:shadow-md transition-all block">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clientes Ativos</span>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{totalClientesAtivos}</p>
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1 group-hover:text-primary transition-colors">
            Ver carteira <ArrowRight className="h-3 w-3" />
          </p>
        </Link>

        {/* Tarefas */}
        <Link href="/tarefas?status=pendente" className="group rounded-xl border border-border bg-card p-5 card-shadow hover:border-primary/30 hover:shadow-md transition-all block">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tarefas Abertas</span>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CheckSquare className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{tarefasPendentes}</p>
          {tarefasVencidas.length > 0 ? (
            <p className="text-xs text-destructive mt-1.5 font-semibold">
              {tarefasVencidas.length} vencida{tarefasVencidas.length !== 1 ? 's' : ''}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1 group-hover:text-primary transition-colors">
              Ver tarefas <ArrowRight className="h-3 w-3" />
            </p>
          )}
        </Link>

        {/* Financeiro — combinado */}
        <div className="rounded-xl border border-border bg-card p-5 card-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financeiro</span>
            <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-success" />
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Link href="/financeiro?status=pendente" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                A receber (7d) · {vencendoCount} lançamento{vencendoCount !== 1 ? 's' : ''}
              </Link>
              <span className="text-sm font-bold text-success tabular-nums">{formatCurrency(somaVencendo)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between">
              <Link href="/financeiro?status=atrasado" className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                Em atraso · {atrasadosCount} lançamento{atrasadosCount !== 1 ? 's' : ''}
              </Link>
              <span className={cn('text-sm font-bold tabular-nums', atrasadosCount > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {formatCurrency(somaAtrasados)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Competências do mês — strip compacto */}
      <div className="rounded-xl border border-border bg-card px-5 py-3.5 card-shadow">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 mr-auto">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Competências — {formatMesAno(mesAtual, anoAtual)}</span>
          </div>
          {Object.entries(COMP_STATUS).map(([key, { label, variant }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <Badge variant={variant} className="text-xs">{label}</Badge>
              <span className="text-sm font-bold tabular-nums">{compCounts[key] ?? 0}</span>
            </div>
          ))}
          <Link href={`/competencias?mes=${mesAtual}&ano=${anoAtual}`} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Listas — 2 colunas com hierarquia de urgência */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

        {/* Coluna esquerda (3/5) — Tarefas + Fechamentos */}
        <div className="lg:col-span-3 space-y-4">

          {/* Tarefas Vencidas */}
          <div className="rounded-xl border border-border bg-card card-shadow overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                <h2 className="text-sm font-semibold">Tarefas Vencidas</h2>
                {tarefasVencidas.length > 0 && (
                  <span className="text-xs tabular-nums bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full font-semibold">
                    {tarefasVencidas.length}
                  </span>
                )}
              </div>
              <Link href="/tarefas" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {tarefasVencidas.length === 0 ? (
              <div className="px-5 py-8 flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-success/50" />
                <p className="text-sm text-muted-foreground">Nenhuma tarefa vencida</p>
              </div>
            ) : (
              <ul>
                {tarefasVencidas.map((t) => (
                  <li key={t.id} className="border-b last:border-0">
                    <Link href={`/tarefas/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.titulo}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{t.clienteNome ?? '—'}</p>
                          {t.dataPrazo && (
                            <p className="text-xs text-destructive font-medium shrink-0">· {formatDate(tsToDate(t.dataPrazo))}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="destructive" className="shrink-0 text-xs">atrasada</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fechamentos Pendentes mês anterior */}
          <div className="rounded-xl border border-border bg-card card-shadow overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-warning" />
                <h2 className="text-sm font-semibold">
                  Fechamentos Pendentes — {formatMesAno(mesAnterior, anoAnterior)}
                </h2>
              </div>
              <Link href={`/competencias?mes=${mesAnterior}&ano=${anoAnterior}&status=aberta`} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {competenciasAbertas.length === 0 ? (
              <div className="px-5 py-8 flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-success/50" />
                <p className="text-sm text-muted-foreground">Todos os fechamentos em dia</p>
              </div>
            ) : (
              <ul>
                {competenciasAbertas.map((c) => (
                  <li key={c.id} className="border-b last:border-0">
                    <Link href={`/competencias/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.clienteNome ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatMesAno(c.mes, c.ano)}</p>
                      </div>
                      <Badge variant="warning" className="shrink-0 text-xs">pendente</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Coluna direita (2/5) — Cobranças vencidas */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card card-shadow overflow-hidden h-full">
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                <h2 className="text-sm font-semibold">Cobranças Vencidas</h2>
              </div>
              <Link href="/financeiro?status=pendente" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {lancamentosVencidos.length === 0 ? (
              <div className="px-5 py-8 flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-success/50" />
                <p className="text-sm text-muted-foreground">Sem cobranças em atraso</p>
              </div>
            ) : (
              <ul>
                {lancamentosVencidos.map((l) => (
                  <li key={l.id} className="border-b last:border-0">
                    <Link href="/financeiro" className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{l.descricao}</p>
                        <p className="text-xs text-muted-foreground truncate">{l.clienteNome ?? '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-destructive">{formatCurrency(l.valor)}</p>
                        <p className="text-xs text-destructive/70">{formatDate(tsToDate(l.dataVencimento))}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { href: '/clientes/novo',     label: 'Novo Cliente',     icon: Users },
          { href: '/competencias/nova', label: 'Nova Competência', icon: ClipboardList },
          { href: '/tarefas/nova',      label: 'Nova Tarefa',      icon: CheckSquare },
          { href: '/financeiro/novo',   label: 'Novo Lançamento',  icon: TrendingUp },
        ] as const).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium card-shadow hover:border-primary/30 hover:bg-primary/5 transition-all group"
          >
            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
