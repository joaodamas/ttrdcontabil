'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate, formatCurrency, tsToDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  FileText, CheckCircle2, XCircle, AlertTriangle,
  Plus, Loader2, Trash2, Layers, History, Receipt,
  TrendingUp, Pencil, ShieldCheck, ShieldAlert, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmitirLoteModal } from '@/components/fiscal/emitir-lote-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { gerarRascunhosNfseMensais, removeRascunho } from '@/features/fiscal/services'
import { getErrorMessage } from '@/lib/error-message'
import { useFiscalDashboard, useFiscalReadiness } from '@/features/fiscal/hooks'
import { fiscalKeys } from '@/features/fiscal/queries'

// ── Status map — soft colors inspired by QIVE ────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  emitida:                 { label: 'Emitida',    className: 'bg-success/10 text-success border-success/20' },
  pendente_processamento:  { label: 'Pendente',   className: 'bg-warning/10 text-amber-800 dark:text-warning border-warning/20' },
  rascunho:                { label: 'Rascunho',   className: 'bg-muted text-muted-foreground border-border' },
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

export default function FiscalPage() {
  const queryClient = useQueryClient()
  const [loteOpen, setLoteOpen] = useState(false)
  const [rascunhoParaRemover, setRascunhoParaRemover] = useState<string | null>(null)
  const [gerarRascunhosOpen, setGerarRascunhosOpen] = useState(false)
  const [notaErroOpen, setNotaErroOpen] = useState<Record<string, unknown> | null>(null)
  const { isLoading: loading, emitidaMesCount, somaEmitidaMes, pendenteCount, erroCount, canceladaCount, notas } = useFiscalDashboard()
  const {
    isLoading: readinessLoading,
    totalClientesAtivos,
    prontosRascunho,
    prontosEmissao,
    bloqueados,
    clientes: readinessClientes,
  } = useFiscalReadiness()

  async function deleteRascunho() {
    if (!rascunhoParaRemover) return
    try {
      await removeRascunho(rascunhoParaRemover)
      await queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() })
      toast.success('Rascunho removido.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível remover o rascunho. Verifique perfil fiscal e tente novamente.'))
    }
  }

  async function prepararRascunhosMensais() {
    const hoje = new Date()
    try {
      const result = await gerarRascunhosNfseMensais({
        mes: hoje.getMonth() + 1,
        ano: hoje.getFullYear(),
        gerarAteHoje: true,
      })
      await queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() })
      const detalhes = result.motivos.length > 0 ? ` ${result.motivos.slice(0, 3).join(' ')}` : ''
      toast.success(`${result.criados} rascunho(s) gerado(s) para revisão. ${result.ignorados} ignorado(s).${detalhes}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível gerar rascunhos NFS-e. Verifique perfil fiscal e configuração dos clientes.'))
    }
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

  function hasErroTecnico(nota: Record<string, unknown>) {
    return Boolean(
      nota.erroUltimaTentativa
      || nota.codigoErroUltimaTentativa
      || nota.detalhesUltimaTentativa
      || nota.requestResumoUltimaTentativa
      || nota.status === 'erro_integracao'
      || nota.status === 'rejeitada'
    )
  }

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">NFS-e — Emissão de Notas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {emitidaMesCount} nota{emitidaMesCount !== 1 ? 's' : ''} emitida{emitidaMesCount !== 1 ? 's' : ''} este mês · {formatCurrency(somaEmitidaMes)}
          </p>
        </div>

        {/* Action toolbar — estilo QIVE */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/fiscal/historico"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <History size={13} />
            Histórico
          </Link>
          <button
            type="button"
            onClick={() => setLoteOpen(true)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Layers size={13} />
            Emitir em Lote
          </button>
          <button
            type="button"
            onClick={() => setGerarRascunhosOpen(true)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <FileText size={13} />
            Preparar mês
          </button>
          <Link
            href="/fiscal/emitir"
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
          >
            <Plus size={13} />
            Nova NFS-e
          </Link>
        </div>
      </div>

      {/* KPI strip — horizontal, compacto */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Emitidas no mês', value: emitidaMesCount, sub: formatCurrency(somaEmitidaMes), icon: Receipt, color: 'text-success', bg: 'bg-success/8' },
          { label: 'Pendentes',       value: pendenteCount,   sub: 'aguardando envio',              icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/8' },
          { label: 'Com erro',        value: erroCount,       sub: 'requer atenção',                icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/8' },
          { label: 'Canceladas',      value: canceladaCount,  sub: 'neste mês',                     icon: CheckCircle2, color: 'text-muted-foreground', bg: 'bg-muted/50' },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 card-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center', bg)}>
                <Icon size={13} className={color} />
              </div>
            </div>
            <p className={cn('text-2xl font-bold tabular-nums tracking-tight', color === 'text-destructive' && value > 0 ? 'text-destructive' : 'text-foreground')}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card card-shadow overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Prontidão para emissão recorrente</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {prontosEmissao}/{totalClientesAtivos} cliente{totalClientesAtivos !== 1 ? 's' : ''} pronto{totalClientesAtivos !== 1 ? 's' : ''} para emissão
          </span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          {[
            { label: 'Clientes ativos', value: totalClientesAtivos, tone: 'text-foreground' },
            { label: 'Prontos p/ rascunho', value: prontosRascunho, tone: 'text-info' },
            { label: 'Prontos p/ emissão', value: prontosEmissao, tone: 'text-success' },
            { label: 'Com bloqueios', value: bloqueados, tone: bloqueados > 0 ? 'text-destructive' : 'text-muted-foreground' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className={cn('mt-1 text-xl font-bold tabular-nums', item.tone)}>{item.value}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Município</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Serviços</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dia NFS-e</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bloqueios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {readinessLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                    Validando clientes e configurações fiscais...
                  </td>
                </tr>
              ) : readinessClientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum cliente ativo encontrado para validação fiscal.
                  </td>
                </tr>
              ) : (
                readinessClientes.slice(0, 8).map((cliente) => (
                  <tr key={cliente.clienteId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium max-w-[240px]">
                      <Link href={`/clientes/${cliente.clienteId}`} className="truncate block hover:text-primary">
                        {cliente.clienteNome}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{cliente.municipio ?? '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{cliente.servicosAtivos}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{cliente.diaEmissaoNFSe ?? '—'}</td>
                    <td className="px-4 py-3">
                      {cliente.prontoEmissao ? (
                        <Badge className="gap-1 bg-success/10 text-success border-success/20">
                          <ShieldCheck size={11} /> Pronto
                        </Badge>
                      ) : cliente.prontoRascunho ? (
                        <Badge variant="outline" className="gap-1 border-warning/30 text-amber-800 dark:text-warning">
                          <AlertTriangle size={11} /> Falta credencial
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle size={11} /> Bloqueado
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[320px]">
                      {cliente.bloqueios.length > 0 ? cliente.bloqueios.slice(0, 3).join(', ') : 'Sem bloqueios'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {readinessClientes.length > 8 && (
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Exibindo os 8 primeiros clientes. Use a página do cliente para corrigir serviço, dia de emissão, configuração fiscal e credenciais.
          </div>
        )}
      </div>

      {/* Notas table — estilo QIVE */}
      <div className="rounded-xl border border-border bg-card card-shadow overflow-hidden">

        {/* Table toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Notas Recentes</h2>
            <span className="text-xs tabular-nums bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
              {totalNotas}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/fiscal/historico"
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              Ver todas <TrendingUp size={11} />
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nº NFS-e</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Emissão</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Valor</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="w-24 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {notas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt size={28} className="text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Nenhuma NFS-e emitida ainda</p>
                      <Link href="/fiscal/emitir" className={cn(buttonVariants({ size: 'sm' }), 'mt-1 gap-1.5')}>
                        <Plus size={13} /> Emitir primeira nota
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                notas.map((n) => {
                  const dataEmissao = n.dataEmissao as Timestamp | undefined
                  const isRascunho = n._origem === 'rascunho'
                  return (
                    <tr
                      key={n.id as string}
                      className={cn(
                        'transition-colors hover:bg-muted/30',
                        isRascunho && 'opacity-75'
                      )}
                    >
                      <td className="px-4 py-3 font-medium max-w-[200px]">
                        <span className="truncate block">{(n.clienteNome as string) ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {(n.numeroNfse as string) ?? (isRascunho ? '(rascunho)' : '—')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCurrency((n.valorServico as number) ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={n.status as string} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {hasErroTecnico(n) ? (
                            <button
                              type="button"
                              onClick={() => setNotaErroOpen(n)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Ver erro técnico"
                            >
                              <Eye size={13} />
                            </button>
                          ) : null}
                          {isRascunho && (
                            <>
                            <Link
                              href={`/fiscal/emitir?rascunhoId=${n.id as string}`}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Revisar rascunho"
                            >
                              <Pencil size={13} />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setRascunhoParaRemover(n.id as string)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Remover rascunho"
                            >
                              <Trash2 size={13} />
                            </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmitirLoteModal
        open={loteOpen}
        onOpenChange={setLoteOpen}
        onSuccess={() => {
          setLoteOpen(false)
          void queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() })
        }}
      />

      <ConfirmDialog
        open={Boolean(rascunhoParaRemover)}
        onOpenChange={(open) => !open && setRascunhoParaRemover(null)}
        title="Remover rascunho de NFS-e?"
        description="Esta ação exclui o rascunho fiscal e não pode ser desfeita pela interface."
        confirmLabel="Remover rascunho"
        destructive
        onConfirm={deleteRascunho}
      />
      <ConfirmDialog
        open={gerarRascunhosOpen}
        onOpenChange={setGerarRascunhosOpen}
        title="Gerar rascunhos NFS-e do mês?"
        description="A ferramenta criará rascunhos recorrentes para clientes ativos com dia de emissão vencido, serviço ativo e configuração fiscal completa. Os rascunhos ficam para revisão antes de qualquer emissão."
        confirmLabel="Gerar rascunhos"
        onConfirm={prepararRascunhosMensais}
      />
      <Dialog open={Boolean(notaErroOpen)} onOpenChange={(open) => !open && setNotaErroOpen(null)}>
        <DialogContent className="max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>Erro técnico da emissão</DialogTitle>
            <DialogDescription>
              Diagnóstico da última tentativa registrada para esta emissão ou rascunho fiscal.
            </DialogDescription>
          </DialogHeader>
          {notaErroOpen ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Cliente</p>
                  <p className="mt-1 font-medium">{(notaErroOpen.clienteNome as string) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
                  <p className="mt-1">{String(notaErroOpen.status ?? '—')}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Código do erro</p>
                  <p className="mt-1 font-mono">{(notaErroOpen.codigoErroUltimaTentativa as string) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Última tentativa</p>
                  <p className="mt-1">
                    {notaErroOpen.ultimaTentativaEm ? tsToDate(notaErroOpen.ultimaTentativaEm as Timestamp)?.toLocaleString('pt-BR') ?? '—' : '—'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Mensagem operacional</p>
                <p className="mt-1 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive">
                  {(notaErroOpen.erroUltimaTentativa as string) ?? 'Sem mensagem operacional registrada.'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Detalhes técnicos</p>
                <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {String(notaErroOpen.detalhesUltimaTentativa ?? 'Sem detalhe técnico adicional.')}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Resumo do request enviado</p>
                <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify((notaErroOpen.requestResumoUltimaTentativa as Record<string, unknown> | undefined) ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
