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

const DOT_COLOR: Record<NonNullable<TimelineEvent['variant']>, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-neutral',
  default: 'bg-primary',
}

const TYPE_ICON: Record<TimelineEventType, React.ReactNode> = {
  tarefa: <CheckSquare className="h-3.5 w-3.5" />,
  nfse: <Receipt className="h-3.5 w-3.5" />,
  competencia: <Layers className="h-3.5 w-3.5" />,
  lancamento: <DollarSign className="h-3.5 w-3.5" />,
  comentario: <MessageCircle className="h-3.5 w-3.5" />,
  sistema: <Info className="h-3.5 w-3.5" />,
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
    <ol className="relative space-y-0 pl-6">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" aria-hidden="true" />

      {events.map((event) => {
        const dotColor = DOT_COLOR[event.variant ?? 'default']
        const icon = TYPE_ICON[event.type]

        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Dot on the vertical line */}
            <span
              className={cn(
                'absolute -left-[3px] top-1 h-3 w-3 shrink-0 rounded-full border-2 border-background',
                dotColor
              )}
              aria-hidden="true"
            />

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Type icon */}
                <span className="text-muted-foreground">{icon}</span>

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
