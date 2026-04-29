'use client'

import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { updateDocument } from '@/lib/firestore-client'
import { formatDate, tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => onToggleSelected?.(task.id, e.target.checked)}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{task.titulo ?? 'Tarefa sem título'}</p>
            <Tooltip>
              <TooltipTrigger>
                <span className="inline-flex cursor-help">
                  <Badge variant="outline" className="capitalize">
                    {task.prioridade ?? 'normal'}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[min(20rem,calc(100vw-2rem))] text-left leading-snug">
                {prioridadeHint(task.prioridade)}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {task.clienteNome ?? 'Sem cliente'} • {task.responsavelNome ?? 'Sem responsável'}
          </p>
          <p className="text-xs text-muted-foreground">
            Prazo: {dt ? formatDate(dt) : 'Sem prazo'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={marcarConcluida} disabled={saving}>
          Concluir
        </Button>
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          defaultValue=""
          onChange={(e) => void reatribuir(e.target.value)}
          disabled={saving}
        >
          <option value="" disabled>Reatribuir</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome ?? 'Usuário'}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="h-8 rounded-md border bg-background px-2 text-xs"
          onChange={(e) => void alterarPrazo(e.target.value)}
          disabled={saving}
        />
      </div>
    </div>
  )
}
