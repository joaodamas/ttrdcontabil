'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createDocument } from '@/lib/firestore-client'

interface TaskTimerProps {
  tarefaId: string
  tarefaTitulo: string
  usuarioId: string
  usuarioNome: string
  acumuladoMs?: number
  className?: string
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TaskTimer({
  tarefaId,
  tarefaTitulo,
  usuarioId,
  usuarioNome,
  acumuladoMs = 0,
  className,
}: TaskTimerProps) {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tick = useCallback(() => {
    if (startRef.current == null) return
    setElapsed(Date.now() - startRef.current)
  }, [])

  function start() {
    startRef.current = Date.now()
    setRunning(true)
    intervalRef.current = setInterval(tick, 1000)
  }

  async function stop(discard = false) {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
    if (!discard && startRef.current != null && elapsed > 0) {
      const durMs = elapsed
      await createDocument('tarefas_timers', {
        tarefaId,
        tarefaTitulo,
        usuarioId,
        usuarioNome,
        inicioEm: new Date(startRef.current),
        fimEm: new Date(),
        duracaoMs: durMs,
      }).catch(() => null)
    }
    startRef.current = null
    setElapsed(0)
  }

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const total = acumuladoMs + (running ? elapsed : 0)

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {total > 0 && (
        <span className={cn(
          'tabular-nums text-xs font-mono min-w-[44px]',
          running ? 'text-primary' : 'text-muted-foreground'
        )}>
          {formatElapsed(total)}
        </span>
      )}
      {!running ? (
        <button
          type="button"
          title="Iniciar timer"
          onClick={start}
          className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Play className="h-3 w-3" />
        </button>
      ) : (
        <>
          <button
            type="button"
            title="Pausar e salvar"
            onClick={() => void stop(false)}
            className="flex h-6 w-6 items-center justify-center rounded border border-primary bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
          >
            <Pause className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Descartar"
            onClick={() => void stop(true)}
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
          >
            <Square className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  )
}
