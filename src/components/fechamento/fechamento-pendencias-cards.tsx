'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Receipt,
  Users,
  FileText,
  Wallet,
  Clock,
  CheckCheck,
  AlertCircle,
  AlertTriangle,
  Minus,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

// Ciclo de status ao clicar
const STATUS_CYCLE: Record<string, StatusObrigacao[]> = {
  das:     ['pendente', 'guia', 'sm', 'enviado', 'parcial', 'na'],
  esocial: ['na', 'pendente', 'ok', 'sm', 'guia'],
  reinf:   ['na', 'pendente', 'ok', 'sm', 'guia'],
  fgts:    ['na', 'pendente', 'ok', 'sm', 'guia'],
}

const STATUS_STYLE: Record<StatusObrigacao, string> = {
  pendente: 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20',
  enviado:  'bg-success/10 text-success border-success/30 hover:bg-success/20',
  parcial:  'bg-info/10 text-info border-info/30 hover:bg-info/20',
  ok:       'bg-success/15 text-success border-success/35 hover:bg-success/25',
  sm:       'bg-success/10 text-success border-success/30 hover:bg-success/20',
  guia:     'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20',
  na:       'bg-muted text-muted-foreground border-border hover:bg-muted/80',
}

const STATUS_LABEL: Record<StatusObrigacao, string> = {
  pendente: 'PEND',
  enviado:  'ENV',
  parcial:  'PAR/',
  ok:       'OK',
  sm:       'SM',
  guia:     'GUIA',
  na:       '—',
}

// Semantic icons per status
const STATUS_ICON: Record<StatusObrigacao, React.ReactNode> = {
  pendente: <Clock className="h-3 w-3 shrink-0" />,
  enviado:  <CheckCheck className="h-3 w-3 shrink-0" />,
  ok:       <CheckCheck className="h-3 w-3 shrink-0" />,
  sm:       <CheckCheck className="h-3 w-3 shrink-0" />,
  parcial:  <AlertCircle className="h-3 w-3 shrink-0" />,
  guia:     <AlertTriangle className="h-3 w-3 shrink-0" />,
  na:       <Minus className="h-3 w-3 shrink-0" />,
}

// Segment bar color per status
const SLOT_BAR_COLOR: Record<StatusObrigacao, string> = {
  pendente: 'bg-amber-500',
  ok:       'bg-emerald-500',
  sm:       'bg-emerald-500',
  enviado:  'bg-emerald-500',
  parcial:  'bg-blue-500',
  guia:     'bg-red-500',
  na:       'bg-muted-foreground/30',
}

// StatusCell defined locally to include icon enhancements
function StatusCell({
  status,
  campo,
  id,
  onUpdate,
  travado = false,
}: {
  status: StatusObrigacao
  campo: string
  id: string
  onUpdate: (id: string, field: string, value: string) => Promise<void>
  travado?: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (travado) return
    const cycle = STATUS_CYCLE[campo] ?? ['pendente', 'ok', 'na']
    const currentIdx = cycle.indexOf(status)
    const nextStatus = cycle[(currentIdx + 1) % cycle.length]
    setLoading(true)
    try {
      await onUpdate(id, `${campo}Status`, nextStatus)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || travado}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold transition-colors min-w-[52px]',
        STATUS_STYLE[status],
        loading && 'opacity-50 cursor-wait',
        travado && 'opacity-60 cursor-not-allowed hover:bg-transparent'
      )}
      title={travado ? 'Mês revisado e travado — reabra para editar' : 'Clique para alterar status'}
    >
      {loading ? (
        '...'
      ) : (
        <>
          {STATUS_ICON[status]}
          {STATUS_LABEL[status]}
        </>
      )}
    </button>
  )
}

// Obligation label + icon pairs
const OBLIGATION_META: Array<{
  label: string
  icon: React.ReactNode
  statusKey: keyof Pick<FechamentoCardRow, 'dasStatus' | 'esocialStatus' | 'reinfStatus' | 'fgtsStatus'>
  campo: string
}> = [
  { label: 'DAS/SN',  icon: <Receipt   className="h-3.5 w-3.5" />, statusKey: 'dasStatus',     campo: 'das'     },
  { label: 'eSocial', icon: <Users      className="h-3.5 w-3.5" />, statusKey: 'esocialStatus', campo: 'esocial' },
  { label: 'Reinf',   icon: <FileText   className="h-3.5 w-3.5" />, statusKey: 'reinfStatus',   campo: 'reinf'   },
  { label: 'FGTS',    icon: <Wallet     className="h-3.5 w-3.5" />, statusKey: 'fgtsStatus',    campo: 'fgts'    },
]

type Props = {
  fechamentos: FechamentoCardRow[]
  onUpdate: (id: string, field: string, value: string) => Promise<void>
  onIrParaTabela?: () => void
  /** Mês travado após "Encerrar revisão" — status deixam de ser clicáveis. */
  travado?: boolean
}

export function FechamentoPendenciasCards({ fechamentos, onUpdate, onIrParaTabela, travado = false }: Props) {
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
          {travado ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-warning">
              <Lock className="h-3 w-3" />
              Mês revisado — travado. Reabra o mês para editar.
            </p>
          ) : null}
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
          const critico = isCritico(f)
          return (
            <Card
              key={f.id}
              className={cn(
                'overflow-hidden transition-shadow',
                expanded && 'ring-1 ring-primary/25',
                critico && 'border-l-2 border-l-warning'
              )}
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
                  {/* Segmented progress bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-1.5 flex-1 max-w-[200px] gap-0.5 overflow-hidden rounded-full bg-muted">
                      {slotStatuses.map((s, i) => (
                        <div
                          key={i}
                          className={cn('h-full flex-1 rounded-sm', SLOT_BAR_COLOR[s])}
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
                    {OBLIGATION_META.map(({ label, icon, statusKey, campo }) => (
                      <div key={campo} className="flex flex-col items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {icon}
                          {label}
                        </span>
                        <StatusCell
                          status={f[statusKey]}
                          campo={campo}
                          id={f.id}
                          onUpdate={onUpdate}
                          travado={travado}
                        />
                      </div>
                    ))}
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
