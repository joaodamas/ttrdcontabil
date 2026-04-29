import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type InsightStripProps = {
  label: string
  value: ReactNode
  hint?: string
  className?: string
  /** Métrica em destaque (usa token `text-metric-hero`) */
  variant?: 'default' | 'compact'
}

/**
 * Faixa de insight / KPI para cockpits (Hoje, Financeiro, etc.).
 * Usa tipografia de métrica definida em `globals.css`.
 */
export function InsightStrip({
  label,
  value,
  hint,
  className,
  variant = 'default',
}: InsightStripProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5',
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div
        className={cn(
          variant === 'default' ? 'text-metric-hero mt-1' : 'mt-1 text-2xl font-bold tabular-nums tracking-tight'
        )}
      >
        {value}
      </div>
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
