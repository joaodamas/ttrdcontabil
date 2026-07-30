'use client'

import { useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { formatDate, formatCurrency, formatDateTime, tsToDate } from '@/lib/utils'
import { exportToExcel } from '@/lib/export-excel'
import { deleteDocument } from '@/lib/firestore-client'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import { LancamentoBaixar } from '@/components/financeiro/lancamento-baixar'
import { FilaCobrancaItem } from '@/components/financeiro/fila-cobranca'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { InlineAlert } from '@/components/ui/inline-alert'
import { useAuth } from '@/contexts/auth-context'
import { Download, Plus, TrendingUp, CheckCircle, AlertTriangle, Receipt, Trash2, Clock, MoreHorizontal, Send, Pause, Play, CalendarClock, History } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FilterSheet, FilterSheetTrigger } from '@/components/ui/filter-sheet'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'
import { AppModal } from '@/components/ui/app-modal'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { financeiroBaseFiltroSchema } from '@/features/financeiro/schemas'
import { useFinanceiroList } from '@/features/financeiro/hooks'
import { financeiroKeys } from '@/features/financeiro/queries'
import { scoreCobranca, motivoPrioridade } from '@/lib/financeiro-prioridade'
import { CentralCobranca } from '@/components/financeiro/central-cobranca'
import { AlertasFinanceiros } from '@/components/financeiro/alertas-financeiros'
import { TimelineFinanceiraModal } from '@/components/financeiro/timeline-financeira'
import type { FirestoreCursor } from '@/lib/firestore-client'
import { fetchWhatsappHistory, pauseWhatsappRuleForLancamento, rescheduleWhatsappRuleForLancamento, resumeWhatsappRuleForLancamento, sendWhatsappNow } from '@/features/whatsapp/services'
import { WHATSAPP_STATUS_LABELS } from '@/features/whatsapp/types'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  pago: { label: 'Pago', variant: 'default' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
  atrasado: { label: 'Atrasado', variant: 'destructive' },
  estornado: { label: 'Estornado', variant: 'secondary' },
}

const TIPO_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  receita: { label: 'Receita', variant: 'default' },
  despesa: { label: 'Despesa', variant: 'secondary' },
}

const WHATSAPP_VARIANT_MAP: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  nao_agendado: 'outline',
  agendado: 'secondary',
  enviado: 'default',
  entregue: 'default',
  lido: 'default',
  respondido: 'default',
  falhou: 'destructive',
  pausado: 'secondary',
}

function FinanceiroContent() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const searchParams = useSearchParams()
  const parsed = financeiroBaseFiltroSchema.parse({
    clienteId: searchParams.get('clienteId') ?? '',
    competenciaId: searchParams.get('competenciaId') ?? '',
  })
  const { clienteId, competenciaId } = parsed
  const [tipo, setTipo] = useState(() => searchParams.get('tipo') ?? '')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '')
  const filterKey = useMemo(
    () => JSON.stringify({ clienteId, competenciaId, tipo, status }),
    [clienteId, competenciaId, tipo, status]
  )
  const [pagination, setPagination] = useState<{
    filterKey: string
    page: number
    cursorStack: Array<FirestoreCursor | null>
  }>({ filterKey, page: 1, cursorStack: [null] })
  const activePagination = pagination.filterKey === filterKey
    ? pagination
    : { filterKey, page: 1, cursorStack: [null] as Array<FirestoreCursor | null> }
  const page = activePagination.page
  const cursor = activePagination.cursorStack[page - 1] ?? null
  const cursorKey = cursor?.id ?? 'first-page'
  const { lancamentos, filteredLancamentos, total, totalPages, hasMore, lastCursor, somaAReceber, somaRecebidoMes, somaEmAtraso, isLoading, isError, error, refetch } =
    useFinanceiroList({ clienteId, competenciaId, tipo, status, page, cursor, cursorKey })
  /**
   * Armadilha: em falha o hook devolve as somas como 0 e a lista como vazia —
   * são defaults de leitura, não fatos sobre o caixa do escritório. Exibir
   * "R$ 0,00 em atraso" quando a query morreu afirma que ninguém deve nada, e
   * alguém decide não cobrar em cima disso. Enquanto o dado não for confiável,
   * todo número vira "—" (ausência de informação) e o export fica travado,
   * porque uma planilha de inadimplência vazia é a mesma mentira em arquivo.
   */
  const semDados = isLoading || isError
  const exportDisabled = semDados || filteredLancamentos.length === 0
  const agora = new Date()
  const filaCobranca = [...filteredLancamentos]
    .filter((l) => l.tipo === 'receita' && l.status === 'pendente')
    .sort((a, b) => scoreCobranca(b, agora) - scoreCobranca(a, agora))
    .slice(0, 5)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [historyLancamentoId, setHistoryLancamentoId] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<Array<Record<string, unknown>>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [timelineLancamento, setTimelineLancamento] = useState<Record<string, unknown> | null>(null)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  async function refreshFinanceiro() {
    await queryClient.invalidateQueries({
      queryKey: financeiroKeys.snapshot({ clienteId, competenciaId, tipo, status, page }),
    })
  }

  async function handleDeleteLancamento() {
    if (!deleteId) return
    await deleteDocument('lancamentos', deleteId)
    toast.success('Lançamento excluído.')
    await refreshFinanceiro()
    setDeleteId(null)
  }

  async function openWhatsappHistory(lancamentoId: string) {
    setHistoryLancamentoId(lancamentoId)
    setHistoryLoading(true)
    try {
      const rows = await fetchWhatsappHistory(lancamentoId)
      setHistoryItems(rows as Array<Record<string, unknown>>)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível carregar o histórico do WhatsApp.'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleWhatsappAction(
    action: 'send' | 'pause' | 'resume' | 'reschedule',
    lancamentoId: string,
    motivo?: string
  ) {
    try {
      if (action === 'send') await sendWhatsappNow(lancamentoId)
      if (action === 'pause') await pauseWhatsappRuleForLancamento(lancamentoId, motivo ?? 'Pausado manualmente')
      if (action === 'resume') await resumeWhatsappRuleForLancamento(lancamentoId)
      if (action === 'reschedule') await rescheduleWhatsappRuleForLancamento(lancamentoId)
      toast.success('Ação de WhatsApp executada.')
      await refreshFinanceiro()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível executar a ação de WhatsApp.'))
    }
  }

  function exportarInadimplencia() {
    const hoje = new Date()
    const agrupado = new Map<string, { cliente: string; quantidade: number; total: number; vencimentoMaisAntigo: string }>()

    for (const lancamento of filteredLancamentos) {
      const vencimento = tsToDate(lancamento.dataVencimento)
      if (lancamento.tipo !== 'receita' || lancamento.status !== 'pendente' || !vencimento || vencimento >= hoje) continue
      const cliente = (lancamento.clienteNome as string | undefined) ?? 'Sem cliente'
      const atual = agrupado.get(cliente) ?? {
        cliente,
        quantidade: 0,
        total: 0,
        vencimentoMaisAntigo: formatDate(vencimento),
      }
      atual.quantidade += 1
      atual.total += (lancamento.valor as number | undefined) ?? 0
      const antigo = new Date(atual.vencimentoMaisAntigo.split('/').reverse().join('-'))
      if (vencimento < antigo) atual.vencimentoMaisAntigo = formatDate(vencimento)
      agrupado.set(cliente, atual)
    }

    exportToExcel(
      'relatorio-inadimplencia',
      Array.from(agrupado.values()).sort((a, b) => b.total - a.total),
      [
        { key: 'cliente', label: 'Cliente' },
        { key: 'quantidade', label: 'Lancamentos em atraso' },
        { key: 'total', label: 'Total em atraso' },
        { key: 'vencimentoMaisAntigo', label: 'Vencimento mais antigo' },
      ]
    )
  }

  function exportarLancamentos() {
    exportToExcel(
      'financeiro-lancamentos',
      filteredLancamentos.map((l) => {
        const vencimento = tsToDate(l.dataVencimento)
        const pagamento = tsToDate(l.dataPagamento)
        return {
          descricao: l.descricao ?? '',
          cliente: l.clienteNome ?? '',
          tipo: TIPO_MAP[l.tipo as string]?.label ?? l.tipo ?? '',
          status: STATUS_MAP[l.status as string]?.label ?? l.status ?? '',
          valor: formatCurrency(l.valor as number),
          vencimento: vencimento ? formatDate(vencimento) : '',
          pagamento: pagamento ? formatDate(pagamento) : '',
          competencia: l.competencia ?? '',
        }
      }),
      [
        { key: 'descricao', label: 'Descricao' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'status', label: 'Status' },
        { key: 'valor', label: 'Valor' },
        { key: 'vencimento', label: 'Vencimento' },
        { key: 'pagamento', label: 'Pagamento' },
        { key: 'competencia', label: 'Competencia' },
      ]
    )
  }

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            {semDados ? '—' : `${total} lançamento${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSheetTrigger
            onClick={() => setFilterSheetOpen(true)}
            activeCount={(tipo ? 1 : 0) + (status ? 1 : 0)}
          />
          <Button variant="outline" size="sm" className="h-10 rounded-xl" disabled={exportDisabled} onClick={exportarLancamentos}>
            <Download className="w-4 h-4 mr-1" />
            Exportar lista
          </Button>
          <Button variant="outline" size="sm" className="h-10 rounded-xl" disabled={exportDisabled} onClick={exportarInadimplencia}>
            <Download className="w-4 h-4 mr-1" />
            Inadimplência
          </Button>
          <Link href="/financeiro/novo">
            <Button size="sm" className="h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1" />
              Novo Lançamento
            </Button>
          </Link>
        </div>
      </div>

      {isError ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar o financeiro."
          description={getErrorMessage(error, 'Ocorreu um erro ao buscar os lançamentos. Os valores abaixo não representam a situação real do escritório.')}
          action={{ label: 'Tentar novamente', onClick: () => void refetch() }}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="A Receber" value={semDados ? '—' : formatCurrency(somaAReceber)} icon={TrendingUp} />
        <KpiCard label="Recebido no Mês" value={semDados ? '—' : formatCurrency(somaRecebidoMes)} icon={CheckCircle} tone="success" />
        <KpiCard label="Em Atraso" value={semDados ? '—' : formatCurrency(somaEmAtraso)} icon={AlertTriangle} tone="danger" />
      </div>

      <CentralCobranca lancamentos={filteredLancamentos as Record<string, unknown>[]} agora={agora} />
      <AlertasFinanceiros lancamentos={filteredLancamentos as Record<string, unknown>[]} agora={agora} />

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={(tipo ? 1 : 0) + (status ? 1 : 0)}
        onReset={() => { setTipo(''); setStatus(''); setPagination({ filterKey, page: 1, cursorStack: [null] }) }}
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'receita', 'despesa'] as const).map(t => (
              <FilterBtn key={t} onClick={() => { setTipo(t); setPagination({ filterKey, page: 1, cursorStack: [null] }) }} active={tipo === t}>
                {t === '' ? 'Todos' : TIPO_MAP[t]?.label ?? t}
              </FilterBtn>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'pendente', 'atrasado', 'pago', 'cancelado', 'estornado'] as const).map(s => (
              <FilterBtn key={s} onClick={() => { setStatus(s); setPagination({ filterKey, page: 1, cursorStack: [null] }) }} active={status === s}>
                {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      <div className="surface-subtle hidden sm:flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Tipo:</span>
          {(['', 'receita', 'despesa'] as const).map((t) => (
            <FilterBtn key={t} onClick={() => { setTipo(t); setPagination({ filterKey, page: 1, cursorStack: [null] }) }} active={tipo === t}>
              {t === '' ? 'Todos' : TIPO_MAP[t]?.label ?? t}
            </FilterBtn>
          ))}
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          {(['', 'pendente', 'atrasado', 'pago', 'cancelado', 'estornado'] as const).map((s) => (
            <FilterBtn key={s} onClick={() => { setStatus(s); setPagination({ filterKey, page: 1, cursorStack: [null] }) }} active={status === s}>
              {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
            </FilterBtn>
          ))}
        </div>
      </div>

      {filaCobranca.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">Fila de cobrança</h3>
              <p className="text-sm text-muted-foreground">
                Ordenada por atraso, proximidade do vencimento e impacto de caixa.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setTipo('receita'); setStatus('pendente'); setPagination({ filterKey, page: 1, cursorStack: [null] }) }}>
              Ver receitas pendentes
            </Button>
          </div>
          <div className="space-y-2">
            {filaCobranca.map((item) => (
              <FilaCobrancaItem
                key={item.id as string}
                item={item}
                agora={agora}
                onBaixado={() =>
                  void queryClient.invalidateQueries({
                    queryKey: financeiroKeys.snapshot({ clienteId, competenciaId, tipo, status, page }),
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <DataTableShell density="compact">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left section-label">Pagador</th>
              <th className="px-4 py-3 text-left section-label">WhatsApp</th>
              <th className="px-4 py-3 text-left section-label">Serviço / Referência</th>
              <th className="px-4 py-3 text-left section-label">Vencimento</th>
              <th className="px-4 py-3 text-left section-label">Pagamento</th>
              <th className="px-4 py-3 text-right section-label">Valor</th>
              <th className="px-4 py-3 text-left section-label">Status</th>
              <th className="px-4 py-3 text-left section-label">Status WhatsApp</th>
              <th className="px-4 py-3 text-left section-label">Última ação</th>
              <th className="px-4 py-3 text-left section-label">Próxima ação</th>
              <th className="px-4 py-3 text-left section-label">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <TableRowSkeleton cols={11} rows={8} />
            ) : isError ? (
              /* Sem este ramo a tabela caía no vazio genérico e convidava a criar
                 lançamento — como se a base estivesse limpa, e não ilegível. */
              <TableEmptyState
                colSpan={11}
                icon={AlertTriangle}
                title="Não foi possível carregar os lançamentos"
                description="A lista está vazia por falha de leitura, não porque não existem lançamentos."
                action={{ label: 'Tentar novamente', variant: 'outline', onClick: () => void refetch() }}
              />
            ) : lancamentos.length === 0 ? (
              <TableEmptyState
                colSpan={11}
                icon={Receipt}
                title="Nenhum lançamento encontrado"
                description={tipo || status ? 'Tente ajustar os filtros.' : 'Clique em "Novo Lançamento" para começar.'}
                action={!tipo && !status ? { label: 'Novo Lançamento', href: '/financeiro/novo' } : undefined}
              />
            ) : lancamentos.map((l) => {
                const st = STATUS_MAP[l.status as string] ?? {
                  label: l.status as string,
                  variant: 'outline' as const,
                }
                const dataVenc = tsToDate(l.dataVencimento)
                const dataPagamento = tsToDate(l.dataPagamento)
                const atrasado =
                  dataVenc &&
                  dataVenc < new Date() &&
                  l.status === 'pendente'
                const statusOperacional =
                  l.status === 'pago'
                    ? 'Pago'
                    : l.status === 'cancelado'
                      ? 'Cancelado'
                      : atrasado
                        ? 'Atrasado'
                        : 'Em dia'
                const riscoScore = scoreCobranca(l as Record<string, unknown>, agora)
                const riscoMotivo = riscoScore >= 100 ? motivoPrioridade(l as Record<string, unknown>, agora) : null
                const whatsappStatus = (l.statusWhatsappCobranca as string | undefined) ?? 'nao_agendado'
                const ultimaAcao = tsToDate(l.ultimoEnvioWhatsappEm)
                const proximaAcao = tsToDate(l.proximaAcaoWhatsappEm)
                const whatsappPausado = Boolean(l.whatsappCobrancaPausada)
                const pagadorNome = (l.pagadorNome as string | undefined) ?? (l.clienteNome as string | undefined) ?? '—'
                const pagadorWhatsapp = (l.pagadorWhatsapp as string | undefined) ?? '—'

                return (
                  <tr key={l.id as string} className={`transition-colors hover:bg-muted/35${riscoMotivo ? ' border-l-2 border-l-destructive' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{pagadorNome}</p>
                        <p className="text-xs text-muted-foreground">{TIPO_MAP[l.tipo as string]?.label ?? (l.tipo as string) ?? '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{pagadorWhatsapp}</td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{(l.descricao as string) ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {(l.competencia as string | undefined) ?? (l.servicoNome as string | undefined) ?? 'Mensalidade / honorário'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={atrasado ? 'text-destructive font-medium' : ''}>
                        {dataVenc ? formatDate(dataVenc) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {dataPagamento ? formatDate(dataPagamento) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatCurrency(l.valor as number)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {riscoMotivo
                          ? <span className="text-[11px] font-medium text-destructive leading-tight">{riscoMotivo}</span>
                          : <span className={`text-xs ${atrasado ? 'text-destructive' : 'text-muted-foreground'}`}>{statusOperacional}</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={WHATSAPP_VARIANT_MAP[whatsappStatus] ?? 'outline'}>
                          {WHATSAPP_STATUS_LABELS[whatsappStatus] ?? whatsappStatus}
                        </Badge>
                        {whatsappPausado ? <span className="text-xs text-muted-foreground">Pausado manualmente</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ultimaAcao ? formatDateTime(ultimaAcao) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {proximaAcao ? formatDateTime(proximaAcao) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Ver timeline" onClick={() => setTimelineLancamento(l as Record<string, unknown>)}>
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        {l.status === 'pendente' ? (
                          <LancamentoBaixar
                            lancamentoId={l.id as string}
                            valor={l.valor as number}
                            clienteNome={l.clienteNome as string | undefined}
                            descricao={l.descricao as string | undefined}
                            dataVencimento={l.dataVencimento as Timestamp | undefined}
                            onBaixado={() => void refreshFinanceiro()}
                          />
                        ) : null}
                        {(l.tipo === 'receita' || usuario?.perfil === 'admin') && (
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {l.tipo === 'receita' ? (
                                <>
                                  <DropdownMenuItem onClick={() => void handleWhatsappAction('send', l.id as string)}>
                                    <Send className="h-3.5 w-3.5 mr-2" />Enviar cobrança agora
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleWhatsappAction(whatsappPausado ? 'resume' : 'pause', l.id as string)}>
                                    {whatsappPausado ? <Play className="h-3.5 w-3.5 mr-2" /> : <Pause className="h-3.5 w-3.5 mr-2" />}
                                    {whatsappPausado ? 'Retomar régua' : 'Pausar régua'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleWhatsappAction('reschedule', l.id as string)}>
                                    <CalendarClock className="h-3.5 w-3.5 mr-2" />Reagendar régua
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void openWhatsappHistory(l.id as string)}>
                                    <History className="h-3.5 w-3.5 mr-2" />Histórico WhatsApp
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              {l.tipo === 'receita' && usuario?.perfil === 'admin' ? <DropdownMenuSeparator /> : null}
                              {usuario?.perfil === 'admin' ? (
                                <DropdownMenuItem onClick={() => setDeleteId(l.id as string)} className="text-destructive">
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </DataTableShell>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPagination({
                    ...activePagination,
                    page: Math.max(1, page - 1),
                  })
                }}
              >
                Anterior
              </Button>
            ) : null}
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!lastCursor) return
                  setPagination((prev) => {
                    const base = prev.filterKey === filterKey ? prev : activePagination
                    return {
                      ...base,
                      page: page + 1,
                      cursorStack: base.cursorStack[page] ? base.cursorStack : [...base.cursorStack, lastCursor],
                    }
                  })
                }}
              >
                Próxima
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="Excluir lançamento?"
        description="Esta ação remove a linha financeira atual. Use apenas para lançamentos indevidos."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          try {
            await handleDeleteLancamento()
          } catch (err) {
            toast.error(getErrorMessage(err, 'Não foi possível excluir o lançamento.'))
          }
        }}
      />

      <AppModal
        open={!!historyLancamentoId}
        onOpenChange={(open) => !open && setHistoryLancamentoId(null)}
        title="Histórico de cobrança por WhatsApp"
        description="Eventos registrados para a régua de cobrança deste lançamento."
        icon={<Receipt className="size-4" />}
        size="lg"
      >
        <div className="space-y-3">
          {historyLoading ? (
            <div className="text-sm text-muted-foreground">Carregando histórico...</div>
          ) : historyItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/25 p-4 text-sm text-muted-foreground">
              Nenhum evento de WhatsApp para este lançamento.
            </div>
          ) : historyItems.map((item) => {
            const createdAt = tsToDate(item.criadoEm)
            const statusLabel = WHATSAPP_STATUS_LABELS[String(item.status ?? '')] ?? String(item.status ?? '—')
            return (
              <div key={String(item.id)} className="rounded-xl border border-border/75 bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{String(item.etapa ?? 'etapa_manual')}</p>
                    <p className="text-xs text-muted-foreground">{createdAt ? formatDateTime(createdAt) : '—'}</p>
                  </div>
                  <Badge variant={WHATSAPP_VARIANT_MAP[String(item.status ?? 'nao_agendado')] ?? 'outline'}>
                    {statusLabel}
                  </Badge>
                </div>
                {item.contatoDestino ? <p className="mt-2 text-sm">Destino: {String(item.contatoDestino)}</p> : null}
                {item.erro ? <p className="mt-2 text-sm text-destructive">Erro: {String(item.erro)}</p> : null}
                {item.detalhes ? <p className="mt-1 text-xs text-muted-foreground">{String(item.detalhes)}</p> : null}
              </div>
            )
          })}
        </div>
      </AppModal>

      <TimelineFinanceiraModal
        lancamento={timelineLancamento}
        open={!!timelineLancamento}
        onOpenChange={(open) => !open && setTimelineLancamento(null)}
      />
    </div>
  )
}

export default function FinanceiroPage() {
  return (
    <Suspense fallback={<div className="space-y-3 py-6"><div className="h-9 w-56 bg-muted rounded-lg animate-pulse" /><div className="h-64 w-full bg-muted/80 rounded-xl animate-pulse" /></div>}>
      <FinanceiroContent />
    </Suspense>
  )
}
