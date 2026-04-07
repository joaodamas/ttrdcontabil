'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, RefreshCw } from 'lucide-react'
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
  pendente: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
  enviado:  'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
  parcial:  'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
  ok:       'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
  sm:       'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200',
  guia:     'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
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

function StatusCell({
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
  simples_nacional: 'bg-blue-100 text-blue-700',
  lucro_presumido:  'bg-purple-100 text-purple-700',
  lucro_real:       'bg-indigo-100 text-indigo-700',
  mei:              'bg-cyan-100 text-cyan-700',
  isento:           'bg-gray-100 text-gray-600',
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
                <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', REGIME_COLOR[f.regime] ?? 'bg-gray-100 text-gray-600')}>
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
