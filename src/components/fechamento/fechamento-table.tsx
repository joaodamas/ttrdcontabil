'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

type StatusObrigacao = 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'

interface Fechamento {
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
  observacoes?: string
}

interface FechamentoTableProps {
  fechamentos: Fechamento[]
  onUpdate: (id: string, field: string, value: string) => Promise<void>
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

export function StatusCell({
  status,
  campo,
  id,
  onUpdate,
}: {
  status: StatusObrigacao
  campo: string
  id: string
  onUpdate: (id: string, field: string, value: string) => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
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
      disabled={loading}
      className={cn(
        'inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-semibold transition-colors min-w-[42px]',
        STATUS_STYLE[status],
        loading && 'opacity-50 cursor-wait'
      )}
      title="Clique para alterar status"
    >
      {loading ? '...' : STATUS_LABEL[status]}
    </button>
  )
}

const REGIME_LABEL: Record<string, string> = {
  simples_nacional: 'SN',
  lucro_presumido:  'LP',
  lucro_real:       'LR',
  mei:              'MEI',
  isento:           'IS',
}

const REGIME_COLOR: Record<string, string> = {
  simples_nacional: 'bg-primary/10 text-foreground/70 border border-primary/20',
  lucro_presumido:  'bg-info/10 text-info border border-info/20',
  lucro_real:       'bg-muted text-foreground/70 border border-border',
  mei:              'bg-success/10 text-success border border-success/20',
  isento:           'bg-muted text-muted-foreground border border-border',
}

export function FechamentoTable({ fechamentos, onUpdate }: FechamentoTableProps) {
  if (fechamentos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum cliente neste filtro. Clique em <strong>Gerar Fechamento</strong> para criar os registros do mês.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-12">COD</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">CLIENTE</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-20">REGIME</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-32">RESPONSÁVEL</th>
            <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground w-16">DAS/SN</th>
            <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground w-16">eSOCIAL</th>
            <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground w-16">REINF</th>
            <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground w-16">FGTS</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-28">PORTAL</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {fechamentos.map((f) => (
            <tr key={f.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{f.clienteCodigo}</td>
              <td className="px-3 py-2 font-medium">{f.clienteNome}</td>
              <td className="px-3 py-2">
                <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', REGIME_COLOR[f.regime] ?? 'bg-muted text-muted-foreground')}>
                  {REGIME_LABEL[f.regime] ?? f.regime}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">{f.responsavel || '—'}</td>
              <td className="px-2 py-2 text-center">
                <StatusCell status={f.dasStatus} campo="das" id={f.id} onUpdate={onUpdate} />
              </td>
              <td className="px-2 py-2 text-center">
                <StatusCell status={f.esocialStatus} campo="esocial" id={f.id} onUpdate={onUpdate} />
              </td>
              <td className="px-2 py-2 text-center">
                <StatusCell status={f.reinfStatus} campo="reinf" id={f.id} onUpdate={onUpdate} />
              </td>
              <td className="px-2 py-2 text-center">
                <StatusCell status={f.fgtsStatus} campo="fgts" id={f.id} onUpdate={onUpdate} />
              </td>
              <td className="px-3 py-2">
                {f.portalUrl && f.portalUrl !== 'PROGRAMA' && f.portalUrl !== 'EMAIL' ? (
                  <a
                    href={f.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Abrir
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{f.formaEntrega ?? f.portalUrl ?? '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
