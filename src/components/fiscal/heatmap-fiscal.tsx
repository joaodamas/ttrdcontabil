'use client'

import { useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { tsToDate, cn } from '@/lib/utils'

type NotaEmitida = Record<string, unknown>

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const DIAS_SEMANA = ['D','S','T','Q','Q','S','S']

function getIntensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-muted/40'
  const ratio = count / Math.max(max, 1)
  if (ratio > 0.75) return 'bg-success'
  if (ratio > 0.5)  return 'bg-success/70'
  if (ratio > 0.25) return 'bg-success/40'
  return 'bg-success/20'
}

function getErrorIntensityClass(count: number): string {
  if (count === 0) return ''
  if (count >= 3)  return 'ring-1 ring-destructive/70'
  return 'ring-1 ring-destructive/40'
}

interface HeatmapFiscalProps {
  notas: NotaEmitida[]
  ano: number
}

export function HeatmapFiscal({ notas, ano }: HeatmapFiscalProps) {
  const { byDay, maxDay } = useMemo(() => {
    const emitidas = new Map<string, number>()
    const erros    = new Map<string, number>()

    for (const n of notas) {
      const dataEmissao = tsToDate(n.dataEmissao as Timestamp | undefined)
        ?? tsToDate(n.criadoEm as Timestamp | undefined)
      if (!dataEmissao) continue
      if (dataEmissao.getFullYear() !== ano) continue

      const key = dataEmissao.toISOString().slice(0, 10)
      const status = n.status as string
      if (status === 'emitida') {
        emitidas.set(key, (emitidas.get(key) ?? 0) + 1)
      } else if (status === 'rejeitada' || status === 'erro_integracao') {
        erros.set(key, (erros.get(key) ?? 0) + 1)
      }
    }

    const byDay: Record<string, { emitidas: number; erros: number }> = {}
    for (const [k, v] of emitidas) byDay[k] = { emitidas: v, erros: erros.get(k) ?? 0 }
    for (const [k, v] of erros)    if (!byDay[k]) byDay[k] = { emitidas: 0, erros: v }

    const maxDay = Math.max(...Object.values(byDay).map(d => d.emitidas), 1)
    return { byDay, maxDay }
  }, [notas, ano])

  // Build full year grid: weeks × 7 days
  const jan1 = new Date(ano, 0, 1)
  const dec31 = new Date(ano, 11, 31)
  // Start from Sunday before Jan 1
  const gridStart = new Date(jan1)
  gridStart.setDate(jan1.getDate() - jan1.getDay())

  const weeks: Date[][] = []
  // eslint-disable-next-line prefer-const
  let current = new Date(gridStart)
  while (current <= dec31 || weeks.length === 0) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
    if (current > dec31 && current.getDay() === 0) break
  }

  // Month labels: find first week of each month
  const monthLabels: Array<{ month: number; weekIdx: number }> = []
  weeks.forEach((week, wi) => {
    const firstDayInYear = week.find(d => d.getFullYear() === ano)
    if (firstDayInYear) {
      const m = firstDayInYear.getMonth()
      if (!monthLabels.find(ml => ml.month === m)) {
        monthLabels.push({ month: m, weekIdx: wi })
      }
    }
  })

  const totalEmitidas = Object.values(byDay).reduce((s, d) => s + d.emitidas, 0)
  const totalErros    = Object.values(byDay).reduce((s, d) => s + d.erros, 0)
  const diasAtivos    = Object.keys(byDay).filter(k => byDay[k].emitidas > 0).length

  return (
    <div className="space-y-3">
      {/* Stats strip */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span className="font-semibold text-foreground tabular-nums">{totalEmitidas}</span> emissões em {ano}</span>
        <span><span className="font-semibold text-foreground tabular-nums">{diasAtivos}</span> dias ativos</span>
        {totalErros > 0 && <span className="text-destructive"><span className="font-semibold tabular-nums">{totalErros}</span> erros/rejeições</span>}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ display: 'grid', gridTemplateColumns: `20px repeat(${weeks.length}, 1fr)`, gap: 2 }}>
          {/* Day labels */}
          <div />
          {weeks.map((_, wi) => (
            <div key={wi} className="text-center">
              {monthLabels.find(ml => ml.weekIdx === wi)
                ? <span className="text-[9px] text-muted-foreground">{MESES_ABREV[monthLabels.find(ml => ml.weekIdx === wi)!.month]}</span>
                : null}
            </div>
          ))}

          {/* Day rows */}
          {[0,1,2,3,4,5,6].map(dow => (
            <>
              <div key={`dow-${dow}`} className="flex items-center justify-end pr-1">
                <span className="text-[9px] text-muted-foreground">{[0,2,4].includes(dow) ? DIAS_SEMANA[dow] : ''}</span>
              </div>
              {weeks.map((week, wi) => {
                const day = week[dow]
                const inYear = day.getFullYear() === ano
                const key = day.toISOString().slice(0, 10)
                const data = byDay[key]
                const emitidas = data?.emitidas ?? 0
                const erros    = data?.erros ?? 0
                return (
                  <div
                    key={`${wi}-${dow}`}
                    title={inYear && (emitidas > 0 || erros > 0) ? `${key}: ${emitidas} emitida(s)${erros > 0 ? `, ${erros} erro(s)` : ''}` : undefined}
                    className={cn(
                      'aspect-square rounded-[2px]',
                      !inYear && 'opacity-0',
                      inYear && getIntensityClass(emitidas, maxDay),
                      inYear && erros > 0 && getErrorIntensityClass(erros)
                    )}
                  />
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Menos</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <div key={i} className={cn('h-3 w-3 rounded-[2px]', getIntensityClass(Math.round(r * maxDay), maxDay))} />
        ))}
        <span>Mais</span>
        <span className="ml-3 flex items-center gap-1">
          <div className="h-3 w-3 rounded-[2px] bg-success/20 ring-1 ring-destructive/40" />
          com erros
        </span>
      </div>
    </div>
  )
}
