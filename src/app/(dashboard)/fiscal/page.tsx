'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate, formatCurrency, tsToDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { NfseStatusBadge } from '@/components/ui/status-badge'
import { destinoBloqueio } from '@/lib/fiscal-bloqueios'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { AppModal } from '@/components/ui/app-modal'
import { KpiCard } from '@/components/ui/kpi-card'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { InlineAlert } from '@/components/ui/inline-alert'
import {
  FileText, CheckCircle2, XCircle, AlertTriangle,
  Plus, Loader2, Trash2, Layers, History, Receipt,
  TrendingUp, Pencil, ShieldCheck, ShieldAlert, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmitirLoteModal } from '@/components/fiscal/emitir-lote-modal'
import { EmitirNfseModal } from '@/components/fiscal/emitir-nfse-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { gerarRascunhosNfseMensais, removeRascunho } from '@/features/fiscal/services'
import { getErrorMessage } from '@/lib/error-message'
import { useFiscalDashboard, useFiscalReadiness } from '@/features/fiscal/hooks'
import { fiscalKeys } from '@/features/fiscal/queries'
import { temHistoricoInterno } from '@/lib/historico-interno'
import { useAuth } from '@/contexts/auth-context'
import { podeOperarNfse } from '@/lib/permissions'
import { useLinhaClicavel, PararLinha } from '@/components/ui/linha-clicavel'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { STATUS_COM_ERRO, STATUS_PENDENTES, hrefHistorico } from '@/features/fiscal/historico-filtros'

/** Cartão de KPI que leva ao histórico filtrado. */
function KpiLink({ href, rotulo, children }: { href: string; rotulo: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={rotulo}
      className="block rounded-2xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  )
}

/**
 * Bloqueios da prontidão como links para onde se corrigem (cadastro ou
 * configuração fiscal do cliente). Só vira link para quem configura NFS-e
 * (admin/fiscal); para os demais continua texto.
 */
function BloqueiosLinks({ bloqueios, clienteId, podeCorrigir, max = 3 }: { bloqueios: readonly string[]; clienteId: string; podeCorrigir: boolean; max?: number }) {
  if (bloqueios.length === 0) return <span>Sem bloqueios</span>
  const visiveis = bloqueios.slice(0, max)
  const resto = bloqueios.length - visiveis.length
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {visiveis.map((b, i) => (
        <span key={b} className="inline-flex items-center gap-1">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {podeCorrigir ? (
            <LinkPermitido href={destinoBloqueio(b, clienteId)} className="underline decoration-dotted underline-offset-2 hover:text-primary">
              {b}
            </LinkPermitido>
          ) : b}
        </span>
      ))}
      {resto > 0 ? <span title={bloqueios.slice(max).join('\n')}>· +{resto}</span> : null}
    </span>
  )
}

export default function FiscalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [loteOpen, setLoteOpen] = useState(false)
  const [rascunhoParaRemover, setRascunhoParaRemover] = useState<string | null>(null)
  const [gerarRascunhosOpen, setGerarRascunhosOpen] = useState(false)
  const [notaErroOpen, setNotaErroOpen] = useState<Record<string, unknown> | null>(null)
  const { usuario } = useAuth()
  // Financeiro tem a tela NFS-e para consultar notas, mas emitir, lote,
  // rascunhos e cancelamento são só admin/fiscal (functions + regras).
  const podeOperar = podeOperarNfse(usuario)
  const linha = useLinhaClicavel()
  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()
  const emissaoModalOpen = podeOperar && searchParams.get('emitir') === '1'
  const modalClienteId = searchParams.get('clienteId') ?? undefined
  const modalRascunhoId = searchParams.get('rascunhoId') ?? undefined
  const {
    isLoading: loading,
    isError: notasIsError,
    error: notasError,
    refetch: refetchNotas,
    emitidaMesCount, somaEmitidaMes, pendenteCount, erroCount, canceladaCount, notas,
  } = useFiscalDashboard()
  const {
    isLoading: readinessLoading,
    isError: readinessIsError,
    error: readinessError,
    refetch: refetchReadiness,
    totalClientesAtivos,
    prontosRascunho,
    prontosEmissao,
    bloqueados,
    emissaoAutomaticaCount,
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

  function openEmissaoModal(params?: { clienteId?: string; rascunhoId?: string }) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('emitir', '1')
    if (params?.clienteId) next.set('clienteId', params.clienteId)
    else next.delete('clienteId')
    if (params?.rascunhoId) next.set('rascunhoId', params.rascunhoId)
    else next.delete('rascunhoId')
    router.push(`/fiscal?${next.toString()}`)
  }

  function closeEmissaoModal() {
    // Aberta de outra tela (botão "Nova NFS-e" do topo, cliente, painel…):
    // fechar volta para lá, sem deixar uma entrada /fiscal?emitir=1 no histórico.
    if (temHistoricoInterno()) {
      router.back()
      return
    }
    const next = new URLSearchParams(searchParams.toString())
    next.delete('emitir')
    next.delete('clienteId')
    next.delete('rascunhoId')
    const query = next.toString()
    router.replace(query ? `/fiscal?${query}` : '/fiscal')
  }

  return (
    <div className="space-y-5">

      <PageHeader
        title={podeOperar ? 'Emitir NFS-e' : 'NFS-e'}
        description={
          notasIsError
            ? 'Não foi possível carregar o resumo de notas.'
            : <>{emitidaMesCount} nota{emitidaMesCount !== 1 ? 's' : ''} emitida{emitidaMesCount !== 1 ? 's' : ''} este mês · {formatCurrency(somaEmitidaMes)}</>
        }
        action={
          <>
            <Link href="/fiscal/historico" className={buttonVariants({ variant: 'outline', size: 'cta' })}>
              <History />
              Histórico de NFS-e
            </Link>
            {podeOperar && (
              <>
                <button
                  type="button"
                  onClick={() => setLoteOpen(true)}
                  className={buttonVariants({ variant: 'outline', size: 'cta' })}
                >
                  <Layers />
                  Emitir em lote
                </button>
                <button
                  type="button"
                  onClick={() => setGerarRascunhosOpen(true)}
                  className={buttonVariants({ variant: 'outline', size: 'cta' })}
                >
                  <FileText />
                  Preparar mês
                </button>
                <button
                  type="button"
                  onClick={() => openEmissaoModal()}
                  className={buttonVariants({ size: 'cta' })}
                >
                  <Plus />
                  Nova NFS-e
                </button>
              </>
            )}
          </>
        }
      />

      {/* KPI strip — horizontal, compacto */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Cada KPI abre o histórico já filtrado pelo que ele conta. */}
        <KpiLink href={hrefHistorico({ status: 'emitida', mes: mesAtual, ano: anoAtual })} rotulo="Ver notas emitidas no mês">
          <KpiCard label="Emitidas no mês" value={notasIsError ? '—' : emitidaMesCount} description={notasIsError ? undefined : formatCurrency(somaEmitidaMes)} icon={Receipt} tone="success" />
        </KpiLink>
        <KpiLink href={hrefHistorico({ status: STATUS_PENDENTES })} rotulo="Ver notas pendentes">
          <KpiCard label="Pendentes" value={notasIsError ? '—' : pendenteCount} description={notasIsError ? undefined : 'aguardando envio'} icon={AlertTriangle} tone="warning" />
        </KpiLink>
        <KpiLink href={hrefHistorico({ status: STATUS_COM_ERRO })} rotulo="Ver notas com erro ou rejeição">
          <KpiCard label="Com erro" value={notasIsError ? '—' : erroCount} description={notasIsError ? undefined : 'requer atenção'} icon={XCircle} tone={!notasIsError && erroCount > 0 ? 'danger' : 'neutral'} />
        </KpiLink>
        <KpiLink href={hrefHistorico({ status: 'cancelada', mes: mesAtual, ano: anoAtual })} rotulo="Ver notas canceladas no mês">
          <KpiCard label="Canceladas" value={notasIsError ? '—' : canceladaCount} description={notasIsError ? undefined : 'neste mês'} icon={CheckCircle2} />
        </KpiLink>
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
            <ShieldAlert size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Prontidão para emissão recorrente</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {readinessIsError
              ? 'Falha ao validar'
              : `${prontosEmissao}/${totalClientesAtivos} cliente${totalClientesAtivos !== 1 ? 's' : ''} pronto${totalClientesAtivos !== 1 ? 's' : ''} para emissão`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4 md:grid-cols-5">
          {[
            { label: 'Clientes ativos', value: readinessIsError ? '—' : totalClientesAtivos, tone: 'text-foreground' },
            { label: 'Prontos p/ rascunho', value: readinessIsError ? '—' : prontosRascunho, tone: 'text-info' },
            { label: 'Prontos p/ emissão', value: readinessIsError ? '—' : prontosEmissao, tone: 'text-success' },
            { label: 'Com bloqueios', value: readinessIsError ? '—' : bloqueados, tone: !readinessIsError && bloqueados > 0 ? 'text-destructive' : 'text-muted-foreground' },
            { label: 'Emissão automática', value: readinessIsError ? '—' : emissaoAutomaticaCount, tone: !readinessIsError && emissaoAutomaticaCount > 0 ? 'text-destructive' : 'text-muted-foreground' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className={cn('mt-1 text-xl font-bold tabular-nums', item.tone)}>{item.value}</p>
            </div>
          ))}
        </div>
        <DataTableShell className="rounded-none border-x-0 border-b-0 shadow-none" density="compact">
          <table className="w-full table-fixed text-sm md:table-auto md:min-w-[760px]">
            <thead className="hidden md:table-header-group">
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
              ) : readinessIsError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <XCircle size={20} className="text-destructive/70" />
                      <p className="text-muted-foreground">
                        {getErrorMessage(readinessError, 'Não foi possível validar a prontidão fiscal dos clientes.')}
                      </p>
                      <button
                        type="button"
                        onClick={() => { void refetchReadiness() }}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
                      >
                        Tentar novamente
                      </button>
                    </div>
                  </td>
                </tr>
              ) : readinessClientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum cliente ativo encontrado para validação fiscal.
                  </td>
                </tr>
              ) : (
                readinessClientes.slice(0, 8).map((cliente) => {
                  const statusBadge = (
                    cliente.prontoEmissao ? (
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
                    )
                  )
                  return (
                  <Fragment key={cliente.clienteId}>
                  <tr {...linha(`/clientes/${cliente.clienteId}`, { className: 'hidden hover:bg-muted/30 transition-colors md:table-row' })}>
                    <td className="px-4 py-3 font-medium max-w-[240px]">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/clientes/${cliente.clienteId}`} className="truncate hover:text-primary">
                          {cliente.clienteNome}
                        </Link>
                        {cliente.emissaoAutomatica && (
                          <span title="Emite sem revisão humana, sozinho, no dia configurado">
                            <Badge variant="destructive" className="gap-1 shrink-0 text-[10px]">
                              <AlertTriangle size={9} /> Auto
                            </Badge>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{cliente.municipio ?? '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{cliente.servicosAtivos}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{cliente.diaEmissaoNFSe ?? '—'}</td>
                    <td className="px-4 py-3">
                      {statusBadge}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[320px]">
                      <BloqueiosLinks bloqueios={cliente.bloqueios} clienteId={cliente.clienteId} podeCorrigir={podeOperar} />
                    </td>
                  </tr>
                  <tr {...linha(`/clientes/${cliente.clienteId}`, { className: 'md:hidden' })}>
                    <td colSpan={6} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Link href={`/clientes/${cliente.clienteId}`} className="truncate hover:text-primary">
                              {cliente.clienteNome}
                            </Link>
                            {cliente.emissaoAutomatica && (
                              <span title="Emite sem revisão humana, sozinho, no dia configurado">
                                <Badge variant="destructive" className="gap-1 shrink-0 text-[10px]">
                                  <AlertTriangle size={9} /> Auto
                                </Badge>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {cliente.municipio ?? '—'} · {cliente.servicosAtivos} serviço{cliente.servicosAtivos !== 1 ? 's' : ''} · dia {cliente.diaEmissaoNFSe ?? '—'}
                          </p>
                        </div>
                        <div className="shrink-0">{statusBadge}</div>
                      </div>
                      {cliente.bloqueios.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <BloqueiosLinks bloqueios={cliente.bloqueios} clienteId={cliente.clienteId} podeCorrigir={podeOperar} />
                        </p>
                      ) : null}
                    </td>
                  </tr>
                  </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </DataTableShell>
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
          <table className="w-full table-fixed text-sm md:table-auto md:min-w-[640px]">
            <thead className="hidden md:table-header-group">
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
              {notasIsError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <XCircle size={28} className="text-destructive/60" />
                      <p className="text-sm text-muted-foreground">
                        {getErrorMessage(notasError, 'Não foi possível carregar as notas fiscais.')}
                      </p>
                      <button
                        type="button"
                        onClick={() => { void refetchNotas() }}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1 gap-1.5')}
                      >
                        Tentar novamente
                      </button>
                    </div>
                  </td>
                </tr>
              ) : notas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt size={28} className="text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Nenhuma NFS-e emitida ainda</p>
                      {podeOperar && (
                        <button
                          type="button"
                          onClick={() => openEmissaoModal()}
                          className={cn(buttonVariants({ size: 'sm' }), 'mt-1 gap-1.5')}
                        >
                          <Plus size={13} /> Emitir primeira nota
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                notas.map((n) => {
                  const dataEmissao = n.dataEmissao as Timestamp | undefined
                  const isRascunho = n._origem === 'rascunho'
                  // Mesmas ações na linha (desktop) e no card (celular).
                  // Linha: nota → detalhe; rascunho → abre a emissão para revisar
                  // (como o lápis), só para quem emite.
                  const alvoLinha = isRascunho
                    ? (podeOperar ? () => openEmissaoModal({ rascunhoId: n.id as string }) : null)
                    : `/fiscal/${n.id as string}`
                  const acoes = (
                    <PararLinha className="flex justify-end gap-2">
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
                      {isRascunho && podeOperar && (
                        <>
                        <button
                          type="button"
                          onClick={() => openEmissaoModal({ rascunhoId: n.id as string })}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="Revisar rascunho"
                        >
                          <Pencil size={13} />
                        </button>
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
                    </PararLinha>
                  )
                  return (
                    <Fragment key={n.id as string}>
                    <tr
                      {...linha(alvoLinha, {
                        className: cn('hidden transition-colors hover:bg-muted/30 md:table-row', isRascunho && 'opacity-75'),
                      })}
                    >
                      <td className="px-4 py-3 font-medium max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{(n.clienteNome as string) ?? '—'}</span>
                          {n.origemEmissao === 'automatica' && (
                            <span title="Emitida automaticamente, sem revisão humana" className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-destructive">
                              Auto
                            </span>
                          )}
                        </div>
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
                        <NfseStatusBadge status={n.status as string} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {acoes}
                      </td>
                    </tr>
                    <tr {...linha(alvoLinha, { className: cn('md:hidden', isRascunho && 'opacity-75') })}>

                      <td colSpan={6} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              <span className="truncate">{(n.clienteNome as string) ?? '—'}</span>
                              {n.origemEmissao === 'automatica' && (
                                <span title="Emitida automaticamente, sem revisão humana" className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-destructive">
                                  Auto
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-mono">{(n.numeroNfse as string) ?? (isRascunho ? '(rascunho)' : '—')}</span>
                              {' · '}{dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency((n.valorServico as number) ?? 0)}</p>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <NfseStatusBadge status={n.status as string} />
                          {acoes}
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmitirLoteModal
        open={podeOperar && loteOpen}
        onOpenChange={setLoteOpen}
        onSuccess={() => {
          setLoteOpen(false)
          void queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() })
        }}
      />
      <EmitirNfseModal
        open={emissaoModalOpen}
        onOpenChange={(open) => {
          if (!open) closeEmissaoModal()
        }}
        clienteId={modalClienteId}
        rascunhoId={modalRascunhoId}
        onFinished={async () => {
          closeEmissaoModal()
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: fiscalKeys.snapshot() }),
            queryClient.invalidateQueries({ queryKey: fiscalKeys.readiness() }),
          ])
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
        open={podeOperar && gerarRascunhosOpen}
        onOpenChange={setGerarRascunhosOpen}
        title="Gerar rascunhos NFS-e do mês?"
        description="A ferramenta criará rascunhos recorrentes para clientes ativos com dia de emissão vencido, serviço ativo e configuração fiscal completa. Os rascunhos ficam para revisão antes de qualquer emissão — exceto para clientes com 'Emissão automática' ligada na config fiscal, que emitem direto, sem revisão."
        confirmLabel="Gerar rascunhos"
        onConfirm={prepararRascunhosMensais}
      />
      <AppModal
        open={Boolean(notaErroOpen)}
        onOpenChange={(open) => !open && setNotaErroOpen(null)}
        title="Erro técnico da emissão"
        description="Diagnóstico da última tentativa registrada para esta emissão ou rascunho fiscal."
        icon={<XCircle className="size-4" />}
        size="lg"
      >
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
      </AppModal>
    </div>
  )
}
