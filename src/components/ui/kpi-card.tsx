import * as React from 'react'
import { cn } from '@/lib/utils'

type KpiTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

type KpiCardProps = {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  description?: React.ReactNode
  tone?: KpiTone
  className?: string
}

const toneClasses: Record<KpiTone, { icon: string; value: string }> = {
  neutral: { icon: 'bg-muted text-muted-foreground', value: 'text-foreground' },
  success: { icon: 'bg-success/10 text-success', value: 'text-success' },
  warning: { icon: 'bg-warning/15 text-warning', value: 'text-warning' },
  danger: { icon: 'bg-destructive/10 text-destructive', value: 'text-destructive' },
  info: { icon: 'bg-info/10 text-info', value: 'text-info' },
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  description,
  tone = 'neutral',
  className,
}: KpiCardProps) {
  const classes = toneClasses[tone]

  return (
    <section className={cn('rounded-2xl border border-border/65 bg-card/95 p-4 card-shadow animate-in fade-in-0 slide-in-from-bottom-2 duration-300', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('mt-2 kpi-value tabular-nums', classes.value)}>{value}</p>
        </div>
        {Icon && (
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', classes.icon)}>
            <Icon className="size-4" />
          </div>
        )}
      </div>
      {description && <div className="mt-2 text-xs text-muted-foreground">{description}</div>}
    </section>
  )
}
