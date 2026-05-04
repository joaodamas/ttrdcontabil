'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import { formatCurrency, formatDate, formatMesAno, tsToDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Users, ClipboardList, CheckSquare, TrendingUp,
  AlertTriangle, ArrowRight, CheckCircle2, DollarSign,
  Receipt, Bell,
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

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
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

  const AVISO_DIAS = 5 // janela de alerta em dias

  useEffect(() => {
    const em7Dias   = new Date(hoje); em7Dias.setDate(hoje.getDate() + 7)
    const hojeTs    = Timestamp.fromDate(hoje)
    const em7DiasTs = Timestamp.fromDate(em7Dias)

    Promise.allSettled([
      listDocuments('clientes',     [where('status', '==', 'ativo')]),
      listDocuments('competencias', [where('mes', '==', mesAtual), where('ano', '==', anoAtual)]),
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
      const clientesData     = get<Record<string, unknown>>(0)
      const compMesData      = get<Record<string, unknown>>(1)
      const tarefasData      = get<Record<string, unknown>>(2)
      const vencendoData     = get<Record<string, unknown>>(3)
      const atrasadosData    = get<Record<string, unknown>>(4)
      const compAbertasData  = get<Record<string, unknown>>(5)
      const lancVencidosData = get<Record<string, unknown>>(6)

      setTotalClientesAtivos(clientesData.length)
      const counts: Record<string, number> = {}
      compMesData.forEach((d) => { const s = d.status as string; counts[s] = (counts[s] ?? 0) + 1 })
      setCompCounts(counts)
      setTarefasPendentes(tarefasData.length)
      setSomaVencendo(vencendoData.reduce((acc, d) => acc + ((d.valor as number) ?? 0), 0))
      setVencendoCount(vencendoData.length)
      setSomaAtrasados(atrasadosData.reduce((acc, d) => acc + ((d.valor as number) ?? 0), 0))
      setAtrasadosCount(atrasadosData.length)
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
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
                  href={`/fiscal/emitir?clienteId=${a.id}`}
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
