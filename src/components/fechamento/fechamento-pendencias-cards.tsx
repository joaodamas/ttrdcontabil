'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusCell } from '@/components/fechamento/fechamento-table'

type StatusObrigacao = 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'

export type FechamentoCardRow = {
  id: string
  clienteCodigo: number
  clienteNome: string
  regime: string
  responsavel: string
  portalUrl?: string
  formaEntrega?: string
  dasStatus: StatusObrigacao
  esocialStatus: StatusObrigacao
  reinfStatus: StatusObrigacao
  fgtsStatus: StatusObrigacao
}

function isCritico(f: FechamentoCardRow): boolean {
  const bad = (s: StatusObrigacao) => s === 'pendente' || s === 'parcial'
  return bad(f.dasStatus) || bad(f.esocialStatus) || bad(f.reinfStatus) || bad(f.fgtsStatus)
}

function slotsLiberados(f: FechamentoCardRow): number {
  const ok = (s: StatusObrigacao) => !['pendente', 'parcial'].includes(s)
  return [f.dasStatus, f.esocialStatus, f.reinfStatus, f.fgtsStatus].filter(ok).length
}

const REGIME_LABEL: Record<string, string> = {
  simples_nacional: 'SN',
  lucro_presumido:  'LP',
  lucro_real:       'LR',
  mei:              'MEI',
  isento:           'IS',
}

const REGIME_COLOR: Record<string, string> = {
  simples_nacional: 'bg-blue-100 text-blue-700',
  lucro_presumido:  'bg-purple-100 text-purple-700',
  lucro_real:       'bg-indigo-100 text-indigo-700',
  mei:              'bg-cyan-100 text-cyan-700',
  isento:           'bg-gray-100 text-gray-600',
}

type Props = {
  fechamentos: FechamentoCardRow[]
  onUpdate: (id: string, field: string, value: string) => Promise<void>
  onIrParaTabela?: () => void
}

export function FechamentoPendenciasCards({ fechamentos, onUpdate, onIrParaTabela }: Props) {
  const criticos = useMemo(() => fechamentos.filter(isCritico), [fechamentos])
  const [openId, setOpenId] = useState<string | null>(null)

  if (criticos.length === 0) {
    return null
  }

  return (
    <div className="stack-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Pendências críticas ({criticos.length})</h3>
          <p className="text-xs text-muted-foreground">
            Obrigações em pendente ou parcial — expanda o cliente para atualizar DAS, eSocial, Reinf e FGTS.
          </p>
        </div>
        {onIrParaTabela ? (
          <Button type="button" variant="outline" size="sm" onClick={onIrParaTabela}>
            Ir para tabela completa
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2">
        {criticos.map((f) => {
          const expanded = openId === f.id
          const done = slotsLiberados(f)
          const slotStatuses = [f.dasStatus, f.esocialStatus, f.reinfStatus, f.fgtsStatus] as StatusObrigacao[]
          return (
            <Card
              key={f.id}
              className={cn('overflow-hidden transition-shadow', expanded && 'ring-1 ring-primary/25')}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/30"
                onClick={() => setOpenId(expanded ? null : f.id)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{f.clienteCodigo}</span>
                    <span className="truncate font-medium">{f.clienteNome}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-semibold',
                        REGIME_COLOR[f.regime] ?? 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {REGIME_LABEL[f.regime] ?? f.regime}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-1.5 flex-1 max-w-[200px] gap-0.5 overflow-hidden rounded-full bg-muted">
                      {slotStatuses.map((s, i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-full flex-1 rounded-sm',
                            s === 'pendente' || s === 'parcial' ? 'bg-amber-500' : 'bg-emerald-500'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{done}/4</span>
                  </div>
                </div>
              </button>
              {expanded ? (
                <CardContent className="border-t border-border/80 pt-4 pb-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        DAS/SN
                      </span>
                      <StatusCell status={f.dasStatus} campo="das" id={f.id} onUpdate={onUpdate} />
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        eSocial
                      </span>
                      <StatusCell status={f.esocialStatus} campo="esocial" id={f.id} onUpdate={onUpdate} />
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Reinf
                      </span>
                      <StatusCell status={f.reinfStatus} campo="reinf" id={f.id} onUpdate={onUpdate} />
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        FGTS
                      </span>
                      <StatusCell status={f.fgtsStatus} campo="fgts" id={f.id} onUpdate={onUpdate} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground truncate max-w-[70%]">
                      {f.responsavel ? `Resp.: ${f.responsavel}` : 'Sem responsável'}
                    </p>
                    {f.portalUrl && f.portalUrl !== 'PROGRAMA' && f.portalUrl !== 'EMAIL' ? (
                      <a
                        href={f.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Portal
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">{f.formaEntrega ?? f.portalUrl ?? '—'}</span>
                    )}
                  </div>
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
