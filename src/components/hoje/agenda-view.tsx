'use client'

import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { cn, tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { HojeTask } from '@/features/hoje/types'

type AgendaItem = HojeTask & { grupo: 'atrasada' | 'hoje' | 'proximos'; score: number }

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

interface AgendaViewProps {
  fila: AgendaItem[]
}

export function AgendaView({ fila }: AgendaViewProps) {
  const hoje = new Date()

  // Build 14-day window: 2 days back + today + 11 forward
  const start = addDays(hoje, -2)
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i))

  // Map tasks to days by dataPrazo; overdue tasks go to hoje slot
  function tasksForDay(day: Date): AgendaItem[] {
    return fila.filter(item => {
      const prazo = tsToDate(item.dataPrazo as Timestamp | undefined)
      if (!prazo) return false
      if (sameDay(prazo, day)) return true
      // Overdue tasks show on today
      if (prazo < hoje && sameDay(day, hoje)) return item.grupo === 'atrasada'
      return false
    })
  }

  // Tasks with no deadline, shown separately
  const semPrazo = fila.filter(item => !item.dataPrazo)

  return (
    <div className="space-y-4">
      {/* 14-day scrollable strip */}
      <div className="overflow-x-auto">
        <div className="flex gap-2 min-w-max pb-1">
          {days.map(day => {
            const isToday = sameDay(day, hoje)
            const isPast  = day < hoje && !isToday
            const dayTasks = tasksForDay(day)
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex flex-col rounded-xl border min-w-[160px] max-w-[200px] overflow-hidden',
                  isToday ? 'border-primary/40 bg-primary/[0.04]' : isPast ? 'border-border/40 bg-muted/20 opacity-70' : 'border-border/60 bg-card'
                )}
              >
                {/* Day header */}
                <div className={cn(
                  'px-3 py-2 border-b text-center',
                  isToday ? 'bg-primary/10' : 'bg-muted/30'
                )}>
                  <p className={cn('text-xs font-semibold uppercase tracking-wide', isToday ? 'text-primary' : 'text-muted-foreground')}>
                    {DIAS_SEMANA[day.getDay()]}
                  </p>
                  <p className={cn('text-lg font-bold tabular-nums leading-none mt-0.5', isToday ? 'text-primary' : '')}>
                    {day.getDate()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{MESES[day.getMonth()]}</p>
                  {dayTasks.length > 0 && (
                    <span className={cn(
                      'mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold',
                      isToday ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'
                    )}>
                      {dayTasks.length}
                    </span>
                  )}
                </div>

                {/* Tasks */}
                <div className="flex-1 divide-y divide-border/40 overflow-y-auto max-h-[280px]">
                  {dayTasks.length === 0 ? (
                    <p className="px-3 py-3 text-center text-[10px] text-muted-foreground/50">livre</p>
                  ) : dayTasks.map(item => (
                    <Link
                      key={item.id}
                      href={`/tarefas/${item.id}`}
                      className={cn(
                        'block px-2.5 py-2 hover:bg-muted/40 transition-colors',
                        item.grupo === 'atrasada' && 'border-l-2 border-l-destructive'
                      )}
                    >
                      <p className="text-xs font-medium line-clamp-2 leading-snug">{item.titulo ?? 'Tarefa'}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{item.clienteNome ?? '—'}</p>
                      {item.prioridade && item.prioridade !== 'normal' && (
                        <Badge
                          variant={item.prioridade === 'urgente' ? 'destructive' : 'outline'}
                          className="mt-1 h-3.5 text-[9px] py-0 px-1"
                        >
                          {item.prioridade}
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tasks without deadline */}
      {semPrazo.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs font-semibold text-warning mb-2">{semPrazo.length} tarefa(s) sem prazo definido</p>
          <div className="flex flex-wrap gap-1.5">
            {semPrazo.slice(0, 8).map(item => (
              <Link
                key={item.id}
                href={`/tarefas/${item.id}`}
                className="rounded-md border border-warning/30 bg-background px-2 py-1 text-[11px] hover:bg-muted transition-colors"
              >
                {item.titulo?.slice(0, 30) ?? 'Tarefa'}{(item.titulo?.length ?? 0) > 30 ? '…' : ''}
              </Link>
            ))}
            {semPrazo.length > 8 && (
              <span className="text-xs text-muted-foreground self-center">+{semPrazo.length - 8} mais</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
