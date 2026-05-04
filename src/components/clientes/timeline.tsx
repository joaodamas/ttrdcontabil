'use client'

import Link from 'next/link'
import { CheckSquare, Receipt, Layers, DollarSign, MessageCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

export type TimelineEventType =
  | 'tarefa'
  | 'nfse'
  | 'competencia'
  | 'lancamento'
  | 'comentario'
  | 'sistema'

export type TimelineEvent = {
  id: string
  type: TimelineEventType
  title: string
  description?: string
  timestamp: Date
  variant?: 'success' | 'warning' | 'destructive' | 'neutral' | 'default'
  href?: string
  metadata?: string
}

type TimelineProps = {
  events: TimelineEvent[]
}

const ICON_CIRCLE_COLOR: Record<NonNullable<TimelineEvent['variant']>, string> = {
  success:     'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  warning:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  destructive: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-500',
  neutral:     'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  default:     'bg-primary/10 text-primary',
}

const TYPE_ICON: Record<TimelineEventType, React.ReactNode> = {
  tarefa:      <CheckSquare className="h-4 w-4" />,
  nfse:        <Receipt className="h-4 w-4" />,
  competencia: <Layers className="h-4 w-4" />,
  lancamento:  <DollarSign className="h-4 w-4" />,
  comentario:  <MessageCircle className="h-4 w-4" />,
  sistema:     <Info className="h-4 w-4" />,
}

function relativeOrAbsolute(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      if (diffMinutes <= 1) return 'agora'
      return `${diffMinutes} min atrás`
    }
    return `${diffHours}h atrás`
  }
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `${diffDays} dias atrás`
  return formatDate(date)
}

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
      </div>
    )
  }

  return (
    <ol className="relative space-y-0 pl-12">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" aria-hidden="true" />

      {events.map((event) => {
        const iconCircleColor = ICON_CIRCLE_COLOR[event.variant ?? 'default']
        const icon = TYPE_ICON[event.type]

        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Icon circle on the vertical line */}
            <span
              className={cn(
                'absolute -left-[15px] top-0 h-8 w-8 shrink-0 rounded-full flex items-center justify-center',
                iconCircleColor
              )}
              aria-hidden="true"
            >
              {icon}
            </span>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-0.5 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Title */}
                {event.href ? (
                  <Link
                    href={event.href}
                    className="text-sm font-medium leading-tight hover:underline underline-offset-2"
                  >
                    {event.title}
                  </Link>
                ) : (
                  <span className="text-sm font-medium leading-tight">{event.title}</span>
                )}

                {/* Metadata badge */}
                {event.metadata && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {event.metadata}
                  </span>
                )}
              </div>

              {/* Description */}
              {event.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>
              )}

              {/* Timestamp */}
              <time
                dateTime={event.timestamp.toISOString()}
                className="block text-[10px] text-muted-foreground/70 tabular-nums"
              >
                {relativeOrAbsolute(event.timestamp)}
              </time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
