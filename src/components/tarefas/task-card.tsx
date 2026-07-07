'use client'

import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { updateDocument } from '@/lib/firestore-client'
import { formatDate, tsToDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CheckCheck, AlertTriangle, Clock, User, Calendar } from 'lucide-react'

type Usuario = { id: string; nome?: string }

type TaskCardProps = {
  task: {
    id: string
    titulo?: string
    clienteNome?: string
    prioridade?: string
    responsavelId?: string
    responsavelNome?: string
    dataPrazo?: Timestamp
    status?: string
  }
  usuarios: Usuario[]
  selected?: boolean
  onToggleSelected?: (id: string, checked: boolean) => void
  onUpdated?: () => void
}

const PRIORIDADE_PESO: Record<string, number> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
}

export function prioridadePeso(prioridade?: string) {
  return PRIORIDADE_PESO[prioridade ?? 'normal'] ?? 2
}

/** Texto explicativo para tooltips e ajuda contextual (cockpit Hoje / tarefas). */
export function prioridadeHint(prioridade?: string): string {
  const p = prioridade ?? 'normal'
  const map: Record<string, string> = {
    urgente:
      'Prioridade máxima: entra no topo das filas e pesa forte no score de SLA do cockpit. Use para bloqueios de fechamento ou risco fiscal imediato.',
    alta:
      'Alta prioridade: acima do fluxo normal; combine com prazo e responsável para não virar gargalo na semana.',
    normal:
      'Prioridade padrão: ordene por prazo e tipo de tarefa (fiscal e financeiro pesam mais no SLA).',
    baixa:
      'Baixa prioridade: pode ser tratada após itens urgentes/altas; ideal para melhorias ou follow-ups sem data crítica.',
  }
  return map[p] ?? map.normal
}

function initials(nome?: string): string {
  if (!nome) return '?'
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

const BORDER_LEFT: Record<string, string> = {
  urgente: 'border-l-destructive',
  alta: 'border-l-warning',
  normal: 'border-l-border',
  baixa: 'border-l-transparent',
}

const PRIORITY_BADGE: Record<string, string> = {
  urgente: 'bg-destructive/10 text-destructive dark:bg-destructive/20 border-transparent',
  alta: 'bg-warning/15 text-amber-800 dark:text-warning dark:bg-warning/20 border-transparent',
  normal: 'bg-muted text-muted-foreground border-transparent',
  baixa: 'bg-muted/50 text-muted-foreground/70 border-transparent',
}

export function TaskCard({ task, usuarios, selected, onToggleSelected, onUpdated }: TaskCardProps) {
  const [saving, setSaving] = useState(false)

  async function marcarConcluida() {
    setSaving(true)
    try {
      await updateDocument('tarefas', task.id, { status: 'concluida', dataConclusao: Timestamp.now() })
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  async function reatribuir(responsavelId: string) {
    const user = usuarios.find((u) => u.id === responsavelId)
    setSaving(true)
    try {
      await updateDocument('tarefas', task.id, { responsavelId, responsavelNome: user?.nome ?? 'Responsável' })
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  async function alterarPrazo(dateIso: string) {
    if (!dateIso) return
    const date = new Date(`${dateIso}T12:00:00`)
    setSaving(true)
    try {
      await updateDocument('tarefas', task.id, { dataPrazo: Timestamp.fromDate(date) })
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  const dt = tsToDate(task.dataPrazo)
  const now = new Date()
  const h48 = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const isOverdue = dt !== null && dt < now
  const isSLACritical = dt !== null && !isOverdue && dt <= h48

  const prioridade = task.prioridade ?? 'normal'
  const borderColor = BORDER_LEFT[prioridade] ?? 'border-l-border'
  const badgeClass = PRIORITY_BADGE[prioridade] ?? PRIORITY_BADGE.normal

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border border-l-4 bg-background shadow-sm hover:shadow-md px-4 py-3 transition-shadow',
        borderColor
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => onToggleSelected?.(task.id, e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate leading-tight">
              {task.titulo ?? 'Tarefa sem título'}
            </p>

            {/* Priority badge */}
            <Tooltip>
              <TooltipTrigger>
                <span
                  className={cn(
                    'inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none border',
                    badgeClass
                  )}
                >
                  {prioridade === 'urgente' && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  )}
                  <span className="capitalize">{prioridade}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[min(20rem,calc(100vw-2rem))] text-left leading-snug">
                {prioridadeHint(task.prioridade)}
              </TooltipContent>
            </Tooltip>

            {/* SLA critical badge */}
            {isSLACritical && (
              <span className="sla-critical inline-flex items-center gap-1 rounded-full bg-warning/15 dark:bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-warning">
                <AlertTriangle className="h-3 w-3" />
                48h
              </span>
            )}

            {/* Overdue badge */}
            {isOverdue && (
              <Badge className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-[10px] px-2 py-0.5 border-transparent">
                <Clock className="h-3 w-3" />
                Atrasada
              </Badge>
            )}
          </div>

          {/* Meta row */}
          <p className="text-xs text-muted-foreground truncate">
            {task.clienteNome ?? 'Sem cliente'}
            {task.responsavelNome ? (
              <>
                {' '}
                <span className="text-border">•</span>{' '}
                <span className="inline-flex items-center gap-0.5">
                  <User className="h-3 w-3 opacity-60" />
                  {task.responsavelNome}
                </span>
              </>
            ) : null}
          </p>

          {/* Deadline row */}
          <p className={cn('text-xs flex items-center gap-1', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            <Calendar className="h-3 w-3 opacity-60" />
            {dt ? formatDate(dt) : 'Sem prazo'}
          </p>
        </div>
      </div>

      {/* Actions — hidden on desktop until hover */}
      <div className="mt-3 flex flex-wrap items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
        <Button size="sm" variant="ghost" onClick={marcarConcluida} disabled={saving} className="h-7 gap-1 text-xs">
          <CheckCheck className="h-3.5 w-3.5" />
          Concluir
        </Button>

        <select
          className="h-7 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          defaultValue=""
          onChange={(e) => void reatribuir(e.target.value)}
          disabled={saving}
        >
          <option value="" disabled>
            {task.responsavelNome
              ? `Reatribuir (${initials(task.responsavelNome)})`
              : 'Reatribuir'}
          </option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome ?? 'Usuário'}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          onChange={(e) => void alterarPrazo(e.target.value)}
          disabled={saving}
          title="Alterar prazo"
        />
      </div>
    </div>
  )
}
