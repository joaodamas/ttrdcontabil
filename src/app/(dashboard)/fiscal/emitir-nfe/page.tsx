'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate, formatCurrency, tsToDate, cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import { InlineAlert } from '@/components/ui/inline-alert'
import {
  Package2, CheckCircle2, XCircle, AlertTriangle,
  Plus, History, Receipt, TrendingUp,
} from 'lucide-react'
import { getErrorMessage } from '@/lib/error-message'
import { useFiscalDashboardNfe } from '@/features/fiscal/hooks'
import { fiscalKeys } from '@/features/fiscal/queries'
import { EmitirNfeModal } from '@/components/fiscal/emitir-nfe-modal'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  emitida:                 { label: 'Emitida',    className: 'bg-success/10 text-success border-success/20' },
  pendente_processamento:  { label: 'Pendente',   className: 'bg-warning/10 text-amber-800 dark:text-warning border-warning/20' },
  aguardando_emissao:      { label: 'Aguardando', className: 'bg-info/10 text-info border-info/20' },
  rejeitada:               { label: 'Rejeitada',  className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelada:               { label: 'Cancelada',  className: 'bg-muted text-muted-foreground border-border' },
  erro_integracao:         { label: 'Erro',       className: 'bg-destructive/10 text-destructive border-destructive/20' },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' }
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', cfg.className)}>
      {cfg.label}
    </span>
  )
}

export default function EmitirNfePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const emissaoModalOpen = searchParams.get('emitir') === '1'
  const modalClienteId = searchParams.get('clienteId') ?? undefined
  const {
    isLoading: loading,
    isError: notasIsError,
    error: notasError,
    refetch: refetchNotas,
    emitidaMesCount, somaEmitidaMes, pendenteCount, erroCount, canceladaCount, notas,
  } = useFiscalDashboardNfe()

  function openEmissaoModal(params?: { clienteId?: string }) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('emitir', '1')
    if (params?.clienteId) next.set('clienteId', params.clienteId)
    else next.delete('clienteId')
    router.push(`/fiscal/emitir-nfe?${next.toString()}`)
  }

  function closeEmissaoModal() {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('emitir')
    next.delete('clienteId')
    const query = next.toString()
    router.replace(query ? `/fiscal/emitir-nfe?${query}` : '/fiscal/emitir-nfe')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    )
  }

  const totalNotas = notas.length

  return (
    <div className="space-y-5">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">NF-e — Emissão de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {notasIsError
              ? 'Não foi possível carregar o resumo de notas.'
              : <>{emitidaMesCount} nota{emitidaMesCount !== 1 ? 's' : ''} emitida{emitidaMesCount !== 1 ? 's' : ''} este mês · {formatCurrency(somaEmitidaMes)}</>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/fiscal/historico?tipo=nfe"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <History size={13} />
            Histórico
          </Link>
          <Link
            href="/fiscal/produtos"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Package2 size={13} />
            Catálogo
          </Link>
          <button
            type="button"
            onClick={() => openEmissaoModal()}
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
          >
            <Plus size={13} />
            Nova NF-e
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Emitidas no mês" value={notasIsError ? '—' : emitidaMesCount} description={notasIsError ? undefined : formatCurrency(somaEmitidaMes)} icon={Receipt} tone="success" />
        <KpiCard label="Pendentes" value={notasIsError ? '—' : pendenteCount} description={notasIsError ? undefined : 'aguardando envio'} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Com erro" value={notasIsError ? '—' : erroCount} description={notasIsError ? undefined : 'requer atenção'} icon={XCircle} tone={!notasIsError && erroCount > 0 ? 'danger' : 'neutral'} />
        <KpiCard label="Canceladas" value={notasIsError ? '—' : canceladaCount} description={notasIsError ? undefined : 'neste mês'} icon={CheckCircle2} />
      </div>

      {notasIsError ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar as notas fiscais."
          description={getErrorMessage(notasError, 'Ocorreu um erro ao buscar as notas. Verifique sua conexão e tente novamente.')}
          action={{ label: 'Tentar novamente', onClick: () => { void refetchNotas() } }}
        />
      ) : null}

      <div className="rounded-xl border border-border bg-card card-shadow overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Package2 size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Notas Recentes</h2>
            <span className="text-xs tabular-nums bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
              {totalNotas}
            </span>
          </div>
          <Link
            href="/fiscal/historico?tipo=nfe"
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            Ver todas <TrendingUp size={11} />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Empresa emissora</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nº</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Emissão</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Valor</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {notasIsError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <XCircle size={28} className="text-destructive/60" />
                      <p className="text-sm text-muted-foreground">
                        {getErrorMessage(notasError, 'Não foi possível carregar as notas fiscais.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : notas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Package2 size={28} className="text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Nenhuma NF-e emitida ainda</p>
                      <button
                        type="button"
                        onClick={() => openEmissaoModal()}
                        className={cn(buttonVariants({ size: 'sm' }), 'mt-1 gap-1.5')}
                      >
                        <Plus size={13} /> Emitir primeira NF-e
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                notas.map((n) => {
                  const dataEmissao = n.dataEmissao as Timestamp | undefined
                  const valor = (n.valorServico as number | undefined) ?? (n.valorTotal as number | undefined) ?? 0
                  return (
                    <tr key={n.id as string} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium max-w-[220px]">
                        <span className="truncate block">{(n.clienteNome as string) ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {(n.numeroNfse as string) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCurrency(valor)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={n.status as string} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmitirNfeModal
        open={emissaoModalOpen}
        onOpenChange={(open) => { if (!open) closeEmissaoModal() }}
        clienteId={modalClienteId}
        onFinished={async () => {
          closeEmissaoModal()
          await queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshotNfe() })
        }}
      />
    </div>
  )
}
