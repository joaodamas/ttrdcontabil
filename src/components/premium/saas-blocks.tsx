import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertCircle,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState as BaseEmptyState } from '@/components/ui/empty-state'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

// ── StatusBadge ───────────────────────────────────────────────

export function StatusBadge({ label, severity }: { label: string; severity: Severity }) {
  const styles: Record<Severity, string> = {
    critical: 'bg-destructive/10 text-destructive border-destructive/25 font-semibold',
    high:     'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400',
    medium:   'bg-info/10 text-info border-info/20',
    low:      'bg-muted text-muted-foreground border-border',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        styles[severity],
      )}
    >
      {severity === 'critical' && (
        <span className="status-dot bg-destructive animate-pulse" />
      )}
      {severity === 'high' && (
        <span className="status-dot bg-amber-500" />
      )}
      {label}
    </span>
  )
}

// ── KpiCard ───────────────────────────────────────────────────

export function KpiCard({
  title,
  value,
  detail,
  trend,
}: {
  title: string
  value: string | number
  detail?: string
  trend?: 'up' | 'down' | 'stable'
}) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  const isAlert = trend === 'up' && numericValue > 0
  const isGood  = trend === 'down' || (trend === 'stable' && numericValue === 0)

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all',
        isAlert && 'border-destructive/25',
        isGood  && 'border-success/20',
      )}
    >
      {/* Top accent stripe */}
      {isAlert && <div className="absolute inset-x-0 top-0 h-0.5 bg-destructive/60 rounded-t-xl" />}
      {isGood  && <div className="absolute inset-x-0 top-0 h-0.5 bg-success/50 rounded-t-xl" />}

      <CardHeader className="pb-1.5 pt-4">
        <CardTitle className="section-label">{title}</CardTitle>
      </CardHeader>

      <CardContent className="pb-4">
        <div className="flex items-end justify-between gap-2">
          <p
            className={cn(
              'text-[2rem] font-bold tracking-tight tabular-nums leading-none',
              isAlert && 'text-destructive',
              isGood && numericValue === 0 && 'text-success',
            )}
          >
            {value}
          </p>
          <div className="mb-0.5 shrink-0">
            {isAlert && <TrendingUp className="h-4 w-4 text-destructive" />}
            {trend === 'down' && <TrendingDown className="h-4 w-4 text-success" />}
            {trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {detail && (
          <p
            className={cn(
              'mt-2 text-xs leading-relaxed',
              isAlert ? 'text-destructive/80' : 'text-muted-foreground',
            )}
          >
            {detail}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── RiskBanner ────────────────────────────────────────────────

export function RiskBanner({
  title,
  description,
  severity,
  ctaLabel,
  ctaHref,
}: {
  title: string
  description: string
  severity: Exclude<Severity, 'low'>
  ctaLabel?: string
  ctaHref?: string
}) {
  const styles = {
    critical: {
      wrapper: 'border-destructive/30 bg-gradient-to-r from-destructive/8 via-destructive/5 to-transparent',
      iconWrap: 'bg-destructive/15',
      icon:     'text-destructive',
      title:    'text-destructive',
      btn:      'destructive' as const,
    },
    high: {
      wrapper: 'border-amber-500/30 bg-gradient-to-r from-amber-500/8 via-amber-500/5 to-transparent',
      iconWrap: 'bg-amber-500/15',
      icon:     'text-amber-600 dark:text-amber-400',
      title:    'text-amber-800 dark:text-amber-300',
      btn:      'default' as const,
    },
    medium: {
      wrapper: 'border-info/25 bg-gradient-to-r from-info/8 via-info/5 to-transparent',
      iconWrap: 'bg-info/15',
      icon:     'text-info',
      title:    'text-foreground',
      btn:      'default' as const,
    },
  }

  const s = styles[severity]

  return (
    <div
      className={cn('rounded-xl border p-4', s.wrapper)}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              s.iconWrap,
            )}
          >
            <AlertTriangle className={cn('h-4 w-4', s.icon)} />
          </div>
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold leading-tight', s.title)}>{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>

        {ctaLabel && ctaHref && (
          <Link href={ctaHref} className="shrink-0">
            <Button size="sm" variant={s.btn}>
              {ctaLabel}
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

// ── ActionBar ─────────────────────────────────────────────────

export function ActionBar({
  title,
  actions,
}: {
  title: string
  actions: Array<{
    label: string
    onClick?: () => void
    href?: string
    variant?: 'default' | 'outline' | 'ghost'
    icon?: React.ComponentType<{ size?: number; className?: string }>
  }>
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          const btn = (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? 'default'}
              onClick={action.onClick}
              className="h-8 gap-1.5"
            >
              {Icon && <Icon size={13} />}
              {action.label}
            </Button>
          )
          return action.href ? (
            <Link key={action.label} href={action.href}>
              <Button size="sm" variant={action.variant ?? 'default'} className="h-8 gap-1.5">
                {Icon && <Icon size={13} />}
                {action.label}
              </Button>
            </Link>
          ) : btn
        })}
      </div>
    </div>
  )
}

// ── DecisionCard ──────────────────────────────────────────────

export function DecisionCard({
  title,
  subtitle,
  children,
  priorityLabel,
  severity,
}: React.PropsWithChildren<{
  title: string
  subtitle?: string
  priorityLabel?: string
  severity?: Severity
}>) {
  const accentMap: Record<Severity, string> = {
    critical: 'border-t-destructive/50',
    high:     'border-t-amber-500/50',
    medium:   'border-t-info/40',
    low:      '',
  }
  const accent = severity ? accentMap[severity] : ''

  return (
    <Card className={cn('card-shadow border-t-2', accent || 'border-t-primary/30')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
            )}
          </div>
          {priorityLabel && (
            <Badge className="shrink-0 text-xs font-semibold">{priorityLabel}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ── PriorityList ──────────────────────────────────────────────

const SEVERITY_ICON: Record<Severity, React.ComponentType<{ className?: string }>> = {
  critical: AlertCircle,
  high:     AlertTriangle,
  medium:   Info,
  low:      Circle,
}

const SEVERITY_STYLES: Record<Severity, { item: string; icon: string; badge: string }> = {
  critical: {
    item:  'border-l-destructive/60 bg-destructive/3 hover:bg-destructive/6',
    icon:  'text-destructive',
    badge: 'bg-destructive/10 text-destructive border-destructive/25',
  },
  high: {
    item:  'border-l-amber-500/60 bg-amber-500/3 hover:bg-amber-500/6',
    icon:  'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400',
  },
  medium: {
    item:  'border-l-info/40 bg-info/3 hover:bg-info/6',
    icon:  'text-info',
    badge: 'bg-info/10 text-info border-info/20',
  },
  low: {
    item:  'border-l-border bg-transparent hover:bg-muted/40',
    icon:  'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground border-border',
  },
}

export function PriorityList<
  T extends { id: string; title: string; subtitle?: string; severity: Severity; href?: string },
>({ items }: { items: T[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Fila limpa"
        description="Sem prioridades críticas no recorte atual."
      />
    )
  }

  return (
    <ul className="space-y-1.5" aria-label="Fila priorizada">
      {items.map((item) => {
        const s = SEVERITY_STYLES[item.severity]
        const Icon = SEVERITY_ICON[item.severity]
        return (
          <li
            key={item.id}
            className={cn(
              'rounded-lg border-l-[3px] border border-border/60 px-3 py-2.5 transition-colors',
              s.item,
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', s.icon)} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                  s.badge,
                )}
              >
                {item.severity}
              </span>
            </div>
            {item.href && (
              <Link
                href={item.href}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Abrir tarefa <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ── ClientHeader ──────────────────────────────────────────────

export function ClientHeader({
  name,
  segment,
  health,
}: {
  name: string
  segment?: string
  health: Array<{ label: string; state: 'ok' | 'warning' | 'risk' }>
}) {
  const stateConfig = {
    ok:      { label: 'Operação estável',  cls: 'text-success',     dot: 'bg-success' },
    warning: { label: 'Monitorar',         cls: 'text-warning',     dot: 'bg-warning' },
    risk:    { label: 'Ação imediata',     cls: 'text-destructive', dot: 'bg-destructive' },
  }

  return (
    <div className="rounded-xl border bg-card p-5 card-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title">{name}</h2>
          {segment && <p className="text-subtle mt-0.5">{segment}</p>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {health.map((item) => {
          const c = stateConfig[item.state]
          return (
            <div
              key={item.label}
              className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3"
            >
              <span className={cn('status-dot mt-1', c.dot)} />
              <div>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className={cn('text-xs font-semibold mt-0.5', c.cls)}>{c.label}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────

export function Timeline({
  items,
}: {
  items: Array<{
    id: string
    title: string
    description?: string
    at: string
    type?: string
    done?: boolean
  }>
}) {
  return (
    <ol className="relative border-l border-border/50 ml-2 space-y-0" aria-label="Timeline do cliente">
      {items.map((item) => (
        <li key={item.id} className="ml-4 pb-5">
          <span
            className={cn(
              'absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full border-2',
              item.done
                ? 'border-success bg-success/20'
                : 'border-muted-foreground/40 bg-background',
            )}
          >
            {item.done && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
          </span>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5 ml-2">
            <p className="text-sm font-medium leading-tight">{item.title}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              {item.at}
              {item.type && <span className="ml-1">· {item.type}</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── DataTable ─────────────────────────────────────────────────

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  columns: Array<{
    key: string
    header: string
    align?: 'left' | 'right'
    render: (row: T) => React.ReactNode
  }>
  rows: T[]
  emptyTitle: string
  emptyDescription: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  'section-label py-3 first:pl-4 last:pr-4',
                  col.align === 'right' && 'text-right',
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'py-3 text-sm first:pl-4 last:pr-4',
                      col.align === 'right' && 'text-right',
                    )}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ── ActionPanel ───────────────────────────────────────────────

export function ActionPanel({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <Card className="card-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}

// ── ProgressBlock ─────────────────────────────────────────────

export function ProgressBlock({
  title,
  current,
  total,
  blockerCount,
}: {
  title: string
  current: number
  total: number
  blockerCount?: number
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const isComplete = pct === 100
  const hasBlockers = typeof blockerCount === 'number' && blockerCount > 0

  return (
    <div className={cn('rounded-xl border bg-card p-4', isComplete && 'border-success/20')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <span
          className={cn(
            'text-xs font-bold tabular-nums',
            isComplete ? 'text-success' : hasBlockers ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {pct}%
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isComplete ? 'bg-success' : hasBlockers ? 'bg-destructive/70' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          {current}/{total} concluídas
        </span>
        {typeof blockerCount === 'number' && (
          <span
            className={cn(
              'font-medium',
              blockerCount > 0 ? 'text-destructive' : 'text-success',
            )}
          >
            {blockerCount > 0 ? `${blockerCount} bloqueio(s)` : 'Sem bloqueios'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── EmptyState (re-export with override) ─────────────────────

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <BaseEmptyState title={title} description={description} />
}
