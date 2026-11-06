'use client'

import { Fragment, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { formatDate, formatCurrency, formatDateTime, tsToDate } from '@/lib/utils'
import { exportToExcel } from '@/lib/export-excel'
import { deleteDocument } from '@/lib/firestore-client'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { PagamentoStatusBadge } from '@/components/ui/status-badge'
import { getStatusLabel } from '@/lib/status-semantics'
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
import { financeiroKeys, useFinanceiroAgregadosQuery } from '@/features/financeiro/queries'
import { agruparInadimplencia, paraItemAging } from '@/features/financeiro/aging'
import type { LancamentoRecord } from '@/features/financeiro/types'
import { scoreCobranca, motivoPrioridade } from '@/lib/financeiro-prioridade'
import { CentralCobranca } from '@/components/financeiro/central-cobranca'
import { AlertasFinanceiros } from '@/components/financeiro/alertas-financeiros'
import { TimelineFinanceiraModal } from '@/components/financeiro/timeline-financeira'
import type { FirestoreCursor } from '@/lib/firestore-client'
import { fetchWhatsappHistory, pauseWhatsappRuleForLancamento, rescheduleWhatsappRuleForLancamento, resumeWhatsappRuleForLancamento, sendWhatsappNow } from '@/features/whatsapp/services'
import { WHATSAPP_STATUS_LABELS } from '@/features/whatsapp/types'
import { WHATSAPP_HABILITADO } from '@/lib/features'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { FiltrosAtivos } from '@/components/ui/filtros-ativos'
import { useNomeCliente, useRotuloCompetencia } from '@/lib/use-nomes-filtro'
import { hrefSemFiltro } from '@/lib/url-filtros'

/** Nome do pagador; com cliente vinculado, leva à ficha do cliente. */
function PagadorLink({ clienteId, nome, className }: { clienteId?: string; nome: string; className?: string }) {
  if (!clienteId) return <span className={className}>{nome}</span>
  return (
    <LinkPermitido href={`/clientes/${encodeURIComponent(clienteId)}`} className={className} title="Abrir ficha do cliente">
      <span className="hover:underline">{nome}</span>
    </LinkPermitido>
  )
}

// Colunas da tabela: as 4 do WhatsApp só existem com o módulo ligado.
const COLUNAS_TABELA = WHATSAPP_HABILITADO ? 11 : 7

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
  // Tipo e status ficam na URL: Voltar e links compartilhados mantêm o filtro.
  const router = useRouter()
  const tipo = searchParams.get('tipo') ?? ''
  const status = searchParams.get('status') ?? ''
  const setFiltros = (mudancas: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    const q = p.toString()
    router.push(q ? `/financeiro?${q}` : '/financeiro', { scroll: false })
  }
  const nomeCliente = useNomeCliente(clienteId)
  const rotuloCompetencia = useRotuloCompetencia(competenciaId)
  const semFiltro = (...chaves: string[]) => hrefSemFiltro('/financeiro', searchParams, chaves)
  const setTipo = (v: string) => setFiltros({ tipo: v })
  const setStatus = (v: string) => setFiltros({ status: v })
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
  const { lancamentos, totalPages, hasMore, lastCursor, somaAReceber, somaRecebidoMes, somaEmAtraso, isLoading, isError, error, refetch } =
    useFinanceiroList({ clienteId, competenciaId, tipo, status, page, cursor, cursorKey })
  /**
   * Segunda query, de propósito: a tabela mostra 20 linhas, os agregados varrem
   * a base inteira do filtro. Antes tudo aqui embaixo — aging, inadimplentes,
   * alertas, fila e os dois exports — era calculado sobre a página aberta, e a
   * planilha de inadimplência saía com 20 linhas parecendo o relatório completo.
   */
  const agregados = useFinanceiroAgregadosQuery({ clienteId, competenciaId, tipo, status })
  const lancamentosCompletos = useMemo(
    () => (agregados.data?.lancamentos ?? []) as LancamentoRecord[],
    [agregados.data]
  )
  const agregadosProntos = !!agregados.data && !agregados.isError
  const truncado = agregados.data?.truncado ?? false
  /**
   * Armadilha: em falha o hook devolve as somas como 0 e a lista como vazia —
   * são defaults de leitura, não fatos sobre o caixa do escritório. Exibir
   * "R$ 0,00 em atraso" quando a query morreu afirma que ninguém deve nada, e
   * alguém decide não cobrar em cima disso. Enquanto o dado não for confiável,
   * todo número vira "—" (ausência de informação) e o export fica travado,
   * porque uma planilha de inadimplência vazia é a mesma mentira em arquivo.
   */
  const semDados = isLoading || isError
  // Truncado também trava o export: meia planilha com cara de planilha inteira
  // é o mesmo erro que esta tarefa veio corrigir, só que com mais linhas.
  const exportDisabled = !agregadosProntos || truncado || lancamentosCompletos.length === 0
  // Instante da leitura dos agregados, não de cada re-render: "atrasado há N
  // dias" tem que ser contado a partir do momento a que os números se referem.
  const agora = useMemo(
    () => (agregados.dataUpdatedAt ? new Date(agregados.dataUpdatedAt) : new Date()),
    [agregados.dataUpdatedAt]
  )
  const filaCobranca = useMemo(
    () =>
      [...lancamentosCompletos]
        .filter((l) => l.tipo === 'receita' && l.status === 'pendente')
        .sort((a, b) => scoreCobranca(b, agora) - scoreCobranca(a, agora))
        .slice(0, 5),
    [lancamentosCompletos, agora]
  )
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [historyLancamentoId, setHistoryLancamentoId] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<Array<Record<string, unknown>>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [timelineLancamento, setTimelineLancamento] = useState<Record<string, unknown> | null>(null)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  // Invalida tabela E agregados: baixar um lançamento muda o aging, a fila e a
  // inadimplência tanto quanto muda a linha da tabela.
  async function refreshFinanceiro() {
    await queryClient.invalidateQueries({ queryKey: financeiroKeys.all })
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

  // Sai da base inteira do filtro, não da página: é a planilha que o escritório
  // usa para cobrar, e antes ela tinha 20 linhas.
  function exportarInadimplencia() {
    const linhas = agruparInadimplencia(lancamentosCompletos.map(paraItemAging), agora)

    exportToExcel(
      'relatorio-inadimplencia',
      linhas.map((l) => ({
        cliente: l.cliente,
        quantidade: l.quantidade,
        total: l.total,
        vencimentoMaisAntigo: formatDate(l.vencimentoMaisAntigo),
      })),
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
      lancamentosCompletos.map((l) => {
        const vencimento = tsToDate(l.dataVencimento)
        const pagamento = tsToDate(l.dataPagamento)
        return {
          descricao: l.descricao ?? '',
          cliente: l.clienteNome ?? '',
          tipo: TIPO_MAP[l.tipo as string]?.label ?? l.tipo ?? '',
          status: (l.status ? getStatusLabel('pagamento', l.status as string) : ''),
          valor: formatCurrency(l.valor as number),
          vencimento: vencimento ? formatDate(vencimento) : '',
          pagamento: pagamento ? formatDate(pagamento) : '',
          competencia: l.competencia ?? '',
        }
      }),
      [
        { key: 'descricao', label: 'Descrição' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'status', label: 'Status' },
        { key: 'valor', label: 'Valor' },
        { key: 'vencimento', label: 'Vencimento' },
        { key: 'pagamento', label: 'Pagamento' },
        { key: 'competencia', label: 'Competência' },
      ]
    )
  }

  return (
    <div className="space-y-5">
      {/* Descrição: antes mostrava o tamanho da página (sempre "20 lançamentos").
          Agora é a contagem do filtro inteiro; "+" quando bateu o teto. */}
      <PageHeader
        title="Financeiro"
        description={
          !agregadosProntos
            ? '—'
            : `${agregados.data!.total.toLocaleString('pt-BR')}${truncado ? '+' : ''} lançamento${agregados.data!.total !== 1 ? 's' : ''}`
        }
        action={
          <>
            <FilterSheetTrigger
              onClick={() => setFilterSheetOpen(true)}
              activeCount={(tipo ? 1 : 0) + (status ? 1 : 0)}
            />
            <Button variant="outline" size="cta" disabled={exportDisabled} onClick={exportarLancamentos}>
              <Download />
              Exportar lista
            </Button>
            <Button variant="outline" size="cta" disabled={exportDisabled} onClick={exportarInadimplencia}>
              <Download />
              Inadimplência
            </Button>
            <LinkPermitido
              href="/financeiro/novo"
              semAcesso="ocultar"
              className={buttonVariants({ size: 'cta' })}
            >
              <Plus />
              Novo lançamento
            </LinkPermitido>
          </>
        }
      />

      {isError ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar o financeiro."
          description={getErrorMessage(error, 'Ocorreu um erro ao buscar os lançamentos. Os valores abaixo não representam a situação real do escritório.')}
          action={{ label: 'Tentar novamente', onClick: () => void refetch() }}
        />
      ) : null}

      {agregados.isError ? (
        /* A tabela pode ter carregado e estes números não. Sem este aviso o
           aging e a fila simplesmente sumiriam da tela, como se não houvesse
           nada a cobrar. */
        <InlineAlert
          tone="danger"
          title="Não foi possível calcular o aging e a inadimplência."
          description={getErrorMessage(agregados.error, 'A leitura da base inteira falhou. Aging, inadimplentes, alertas e os exports ficam indisponíveis até a releitura.')}
          action={{ label: 'Tentar novamente', onClick: () => void agregados.refetch() }}
        />
      ) : null}

      {truncado ? (
        <InlineAlert
          tone="warning"
          title="Base maior que o limite de leitura desta tela"
          description={`Foram lidos ${agregados.data!.teto.toLocaleString('pt-BR')} lançamentos e há mais. O aging, os inadimplentes e a previsão abaixo estão incompletos, e os exports ficam bloqueados — filtre por cliente ou competência para reduzir o conjunto.`}
        />
      ) : null}

      {/* Os KPIs somam o escritório inteiro no servidor e ignoram os filtros da
          tela de propósito; o aging logo abaixo segue os filtros. A descrição
          existe para os dois números não parecerem a mesma coisa discordando. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard label="A Receber" value={semDados ? '—' : formatCurrency(somaAReceber)} icon={TrendingUp} description="Escritório inteiro — não segue os filtros." />
        <KpiCard label="Recebido no Mês" value={semDados ? '—' : formatCurrency(somaRecebidoMes)} icon={CheckCircle} tone="success" description="Escritório inteiro — não segue os filtros." />
        <KpiCard label="Em Atraso" value={semDados ? '—' : formatCurrency(somaEmAtraso)} icon={AlertTriangle} tone="danger" description="Escritório inteiro — não segue os filtros." className="col-span-2 sm:col-span-1" />
      </div>

      {/* Só renderiza com dado na mão: painel vazio por falha de leitura afirma
          que não há nada em atraso. */}
      {agregadosProntos ? (
        <>
          <CentralCobranca lancamentos={lancamentosCompletos as Record<string, unknown>[]} agora={agora} />
          <AlertasFinanceiros lancamentos={lancamentosCompletos as Record<string, unknown>[]} agora={agora} />
        </>
      ) : null}

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={(tipo ? 1 : 0) + (status ? 1 : 0)}
        onReset={() => { setFiltros({ tipo: '', status: '' }); setPagination({ filterKey, page: 1, cursorStack: [null] }) }}
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
                {s === '' ? 'Todos' : getStatusLabel('pagamento', s)}
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
              {s === '' ? 'Todos' : getStatusLabel('pagamento', s)}
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
            <Button variant="outline" size="sm" onClick={() => { setFiltros({ tipo: 'receita', status: 'pendente' }); setPagination({ filterKey, page: 1, cursorStack: [null] }) }}>
              Ver receitas pendentes
            </Button>
          </div>
          <div className="space-y-2">
            {filaCobranca.map((item) => (
              <FilaCobrancaItem
                key={item.id as string}
                item={item}
                agora={agora}
                onBaixado={() => void refreshFinanceiro()}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* clienteId/competenciaId chegam de outras telas ("Financeiro do
          cliente") e antes filtravam a lista sem aparecer em lugar nenhum. */}
      <FiltrosAtivos
        chips={[
          clienteId && { chave: 'clienteId', rotulo: 'Cliente', valor: nomeCliente, removerHref: semFiltro('clienteId') },
          competenciaId && { chave: 'competenciaId', rotulo: 'Competência', valor: rotuloCompetencia, removerHref: semFiltro('competenciaId') },
          tipo && { chave: 'tipo', rotulo: 'Tipo', valor: TIPO_MAP[tipo]?.label ?? tipo, removerHref: semFiltro('tipo') },
          status && { chave: 'status', rotulo: 'Status', valor: getStatusLabel('pagamento', status), removerHref: semFiltro('status') },
        ]}
        limparHref="/financeiro"
      />

      <DataTableShell density="compact">
        <table className={`w-full table-fixed text-sm md:table-auto ${WHATSAPP_HABILITADO ? 'md:min-w-[1180px]' : 'md:min-w-[900px]'}`}>
          <thead className="hidden bg-muted/50 md:table-header-group">
            <tr>
              <th className="px-4 py-3 text-left section-label">Pagador</th>
              {WHATSAPP_HABILITADO && <th className="px-4 py-3 text-left section-label">WhatsApp</th>}
              <th className="px-4 py-3 text-left section-label">Serviço / Referência</th>
              <th className="px-4 py-3 text-left section-label">Vencimento</th>
              <th className="px-4 py-3 text-left section-label">Pagamento</th>
              <th className="px-4 py-3 text-right section-label">Valor</th>
              <th className="px-4 py-3 text-left section-label">Status</th>
              {WHATSAPP_HABILITADO && (
                <>
                  <th className="px-4 py-3 text-left section-label">Status WhatsApp</th>
                  <th className="px-4 py-3 text-left section-label">Última ação</th>
                  <th className="px-4 py-3 text-left section-label">Próxima ação</th>
                </>
              )}
              <th className="px-4 py-3 text-left section-label">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <TableRowSkeleton cols={COLUNAS_TABELA} rows={8} />
            ) : isError ? (
              /* Sem este ramo a tabela caía no vazio genérico e convidava a criar
                 lançamento — como se a base estivesse limpa, e não ilegível. */
              <TableEmptyState
                colSpan={COLUNAS_TABELA}
                icon={AlertTriangle}
                title="Não foi possível carregar os lançamentos"
                description="A lista está vazia por falha de leitura, não porque não existem lançamentos."
                action={{ label: 'Tentar novamente', variant: 'outline', onClick: () => void refetch() }}
              />
            ) : lancamentos.length === 0 ? (
              <TableEmptyState
                colSpan={COLUNAS_TABELA}
                icon={Receipt}
                title="Nenhum lançamento encontrado"
                description={tipo || status || clienteId || competenciaId ? 'Tente ajustar os filtros.' : 'Clique em "Novo lançamento" para começar.'}
                action={!tipo && !status ? { label: 'Novo lançamento', href: '/financeiro/novo' } : undefined}
              />
            ) : lancamentos.map((l) => {
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
                // Mesmas ações na linha (desktop) e no card (celular).
                const acoes = (
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
                    {((WHATSAPP_HABILITADO && l.tipo === 'receita') || usuario?.perfil === 'admin') && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {WHATSAPP_HABILITADO && l.tipo === 'receita' ? (
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
                          {WHATSAPP_HABILITADO && l.tipo === 'receita' && usuario?.perfil === 'admin' ? <DropdownMenuSeparator /> : null}
                          {usuario?.perfil === 'admin' ? (
                            <DropdownMenuItem onClick={() => setDeleteId(l.id as string)} className="text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )

                return (
                  <Fragment key={l.id as string}>
                  <tr className={`hidden transition-colors hover:bg-muted/35 md:table-row${riscoMotivo ? ' border-l-2 border-l-destructive' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <PagadorLink clienteId={l.clienteId as string | undefined} nome={pagadorNome} className="font-medium" />
                        <p className="text-xs text-muted-foreground">{TIPO_MAP[l.tipo as string]?.label ?? (l.tipo as string) ?? '—'}</p>
                      </div>
                    </td>
                    {WHATSAPP_HABILITADO && <td className="px-4 py-3 text-muted-foreground">{pagadorWhatsapp}</td>}
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
                        <PagamentoStatusBadge status={l.status as string} />
                        {riscoMotivo
                          ? <span className="text-[11px] font-medium text-destructive leading-tight">{riscoMotivo}</span>
                          : <span className={`text-xs ${atrasado ? 'text-destructive' : 'text-muted-foreground'}`}>{statusOperacional}</span>
                        }
                      </div>
                    </td>
                    {WHATSAPP_HABILITADO && (
                      <>
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
                      </>
                    )}
                    <td className="px-4 py-3">
                      {acoes}
                    </td>
                  </tr>
                  <tr className={`md:hidden${riscoMotivo ? ' border-l-2 border-l-destructive' : ''}`}>
                    <td colSpan={COLUNAS_TABELA} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <PagadorLink clienteId={l.clienteId as string | undefined} nome={pagadorNome} className="block truncate text-sm font-medium" />

                          <p className="truncate text-xs text-muted-foreground">{(l.descricao as string) ?? '—'}</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(l.valor as number)}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Venc. <span className={atrasado ? 'text-destructive font-medium' : ''}>{dataVenc ? formatDate(dataVenc) : '—'}</span>
                        {dataPagamento ? ` · Pago ${formatDate(dataPagamento)}` : ''}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          <PagamentoStatusBadge status={l.status as string} />
                          {WHATSAPP_HABILITADO && (
                            <Badge variant={WHATSAPP_VARIANT_MAP[whatsappStatus] ?? 'outline'}>
                              {WHATSAPP_STATUS_LABELS[whatsappStatus] ?? whatsappStatus}
                            </Badge>
                          )}
                          {riscoMotivo ? <span className="text-[11px] font-medium text-destructive leading-tight">{riscoMotivo}</span> : null}
                        </div>
                        <div className="shrink-0">{acoes}</div>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
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
