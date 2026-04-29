'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { listDocuments, getCliente } from '@/lib/firestore-client'
import { formatDate, formatCurrency, tsToDate } from '@/lib/utils'
import {
  scoreCobranca,
  somaReceitaPendenteProximasHoras,
  topConcentracaoClientes,
} from '@/lib/financeiro-prioridade'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LancamentoBaixar } from '@/components/financeiro/lancamento-baixar'
import { FilaCobrancaItem } from '@/components/financeiro/fila-cobranca'
import { InlineAlert } from '@/components/ui/inline-alert'
import { InsightStrip } from '@/components/ui/insight-strip'
import { TableEmptyState } from '@/components/ui/empty-state'
import {
  Plus,
  TrendingDown,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
} from 'lucide-react'

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

const PAGE_SIZE = 20

function FinanceiroContent() {
  const searchParams = useSearchParams()
  const tipo = searchParams.get('tipo') ?? ''
  const status = searchParams.get('status') ?? ''
  const clienteId = searchParams.get('clienteId') ?? ''
  const competenciaId = searchParams.get('competenciaId') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allLancamentos, setAllLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [somaAReceber, setSomaAReceber] = useState(0)
  const [somaRecebidoMes, setSomaRecebidoMes] = useState(0)
  const [somaEmAtraso, setSomaEmAtraso] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [listaCompletaAberta, setListaCompletaAberta] = useState(false)
  const [emailsPorCliente, setEmailsPorCliente] = useState<Record<string, string>>({})
  const agora = useMemo(() => new Date(), [])

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true)
      setErro(null)
      const hoje = new Date()
      const hojeTs = Timestamp.fromDate(hoje)
      const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
      const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))

      const constraints = [
        ...(tipo ? [where('tipo', '==', tipo)] : []),
        ...(status ? [where('status', '==', status)] : []),
        ...(clienteId ? [where('clienteId', '==', clienteId)] : []),
        ...(competenciaId ? [where('competenciaId', '==', competenciaId)] : []),
        orderBy('dataVencimento', 'asc'),
      ]

      Promise.all([
        listDocuments('lancamentos', constraints),
        listDocuments('lancamentos', [where('tipo', '==', 'receita'), where('status', '==', 'pendente')]),
        listDocuments('lancamentos', [
          where('tipo', '==', 'receita'),
          where('status', '==', 'pago'),
          where('dataPagamento', '>=', inicioMes),
          where('dataPagamento', '<=', fimMes),
        ]),
        listDocuments('lancamentos', [
          where('tipo', '==', 'receita'),
          where('status', '==', 'pendente'),
          where('dataVencimento', '<', hojeTs),
        ]),
      ])
        .then(([mainData, aReceberData, recebidoMesData, emAtrasoData]) => {
          setAllLancamentos(mainData as Array<Record<string, unknown>>)
          setSomaAReceber(
            aReceberData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0)
          )
          setSomaRecebidoMes(
            recebidoMesData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0)
          )
          setSomaEmAtraso(
            emAtrasoData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0)
          )
        })
        .catch(() => setErro('Não foi possível carregar o financeiro.'))
        .finally(() => setLoading(false))
    })
  }, [tipo, status, clienteId, competenciaId])

  const filaCobranca = useMemo(() => {
    const candidatos = allLancamentos.filter((l) => l.tipo === 'receita' && l.status === 'pendente')
    return [...candidatos]
      .map((l) => ({ l, s: scoreCobranca(l, agora) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.l)
      .slice(0, 12)
  }, [allLancamentos, agora])

  const filaClienteIdsCsv = useMemo(() => {
    const ids = new Set<string>()
    for (const l of filaCobranca) {
      const cid = l.clienteId as string | undefined
      if (cid) ids.add(cid)
    }
    return [...ids].sort().join(',')
  }, [filaCobranca])

  useEffect(() => {
    if (!filaClienteIdsCsv) {
      queueMicrotask(() => setEmailsPorCliente({}))
      return
    }
    const ids = filaClienteIdsCsv.split(',').filter(Boolean)
    let cancelled = false
    void Promise.all(
      ids.map(async (cid) => {
        try {
          const c = await getCliente(cid)
          const raw = (c && (c as Record<string, unknown>).email as string | undefined)?.trim()
          return raw?.includes('@') ? ([cid, raw] as const) : null
        } catch {
          return null
        }
      })
    ).then((rows) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const r of rows) {
        if (r) next[r[0]] = r[1]
      }
      setEmailsPorCliente(next)
    })
    return () => {
      cancelled = true
    }
  }, [filaClienteIdsCsv])

  const janela48h = useMemo(
    () => somaReceitaPendenteProximasHoras(allLancamentos, agora, 48),
    [allLancamentos, agora]
  )

  const concentracao = useMemo(() => topConcentracaoClientes(allLancamentos, agora, 3), [allLancamentos, agora])

  const qtdAtrasadosReceita = useMemo(() => {
    return allLancamentos.filter((l) => {
      if (l.tipo !== 'receita' || l.status !== 'pendente') return false
      const d = tsToDate(l.dataVencimento)
      return !!d && d < agora
    }).length
  }, [allLancamentos, agora])

  const insightLinha = useMemo(() => {
    if (concentracao.length === 0 && qtdAtrasadosReceita === 0) {
      return 'Carteira sem recebíveis atrasados no filtro atual. Revise vencimentos da semana para antecipar cobrança.'
    }
    const top = concentracao[0]
    const pct =
      somaEmAtraso > 0 && top
        ? Math.round((top.total / somaEmAtraso) * 100)
        : null
    if (top && pct !== null && pct >= 40) {
      return `${pct}% do valor em atraso está em “${top.nome}”. Priorize acordo ou cobrança antes de novos lançamentos.`
    }
    if (janela48h.qtd > 0) {
      return `${janela48h.qtd} recebível(is) vencem nas próximas 48h (${formatCurrency(janela48h.total)}).`
    }
    return 'Use a fila abaixo na ordem sugerida — atraso e valor próximo ao vencimento pesam mais.'
  }, [concentracao, qtdAtrasadosReceita, somaEmAtraso, janela48h])

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      ...(tipo && { tipo }),
      ...(status && { status }),
      ...(clienteId && { clienteId }),
      ...(competenciaId && { competenciaId }),
      page: String(page),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/financeiro?${params.toString()}`
  }

  function handleBaixado(id: string) {
    setAllLancamentos((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'pago' } : x)))
  }

  /** Com fila vazia, a tabela fica visível para não esconder lançamentos sem ação de cobrança. */
  const tabelaLancamentosVisivel = filaCobranca.length === 0 || listaCompletaAberta

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (erro) {
    return (
      <div className="stack-6">
        <InlineAlert tone="danger" title="Erro ao carregar financeiro" description={erro} />
        <div>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  const total = allLancamentos.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const lancamentos = allLancamentos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const acoesNecessarias = qtdAtrasadosReceita + janela48h.qtd

  return (
    <div className="stack-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-title">Financeiro</h2>
          <p className="text-subtle max-w-2xl">
            Centro de decisão da carteira —{' '}
            {acoesNecessarias > 0
              ? `${acoesNecessarias} recebível(is) exigem atenção (atraso ou 48h).`
              : 'Nenhum alerta de cobrança urgente no filtro atual.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recebido no mês <span className="font-medium text-foreground">{formatCurrency(somaRecebidoMes)}</span>
            {' · '}
            Pendente (receita){' '}
            <span className="font-medium text-foreground">{formatCurrency(somaAReceber)}</span>
          </p>
        </div>
        <Link href="/financeiro/novo">
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Novo lançamento
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-destructive">
                Exposição em atraso (receita)
              </CardTitle>
              <TrendingDown className="h-4 w-4 shrink-0 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-destructive">
              {formatCurrency(somaEmAtraso)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {qtdAtrasadosReceita} lançamento(s) pendente(s) com vencimento passado
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Janela de cobrança (48h)
              </CardTitle>
              <Clock className="h-4 w-4 shrink-0 text-amber-700" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {formatCurrency(janela48h.total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {janela48h.qtd} recebível(is) com vencimento nas próximas 48 horas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 rounded-xl border border-border/80 bg-card/80 p-1 pr-4 shadow-sm">
        <Sparkles className="ml-3 mt-3 h-4 w-4 shrink-0 text-primary" />
        <InsightStrip
          label="Resumo inteligente"
          value={acoesNecessarias === 0 ? 'Carteira estável' : `${acoesNecessarias} alerta(s)`}
          hint={insightLinha}
          variant="compact"
          className="min-w-0 flex-1 border-0 bg-transparent p-3 pl-0 shadow-none"
        />
      </div>

      {qtdAtrasadosReceita > 0 ? (
        <InlineAlert
          tone="danger"
          title="Risco de inadimplência na carteira"
          description="Priorize baixa ou cobrança nos itens atrasados antes de expandir novos recebíveis."
        />
      ) : null}

      {filaCobranca.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold tracking-tight">O que cobrar primeiro</h3>
              <p className="text-xs text-muted-foreground">
                Ordem por atraso, proximidade do vencimento e valor — ações rápidas à direita.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {filaCobranca.map((l) => {
              const lid = l.id as string
              const cid = l.clienteId as string | undefined
              const emailLancamento = (l as Record<string, unknown>).clienteEmail as string | undefined
              const emailCadastro = cid ? emailsPorCliente[cid] : undefined
              const item = {
                ...l,
                clienteEmail: (emailLancamento?.trim() || emailCadastro) as string | undefined,
              }
              return <FilaCobrancaItem key={lid} item={item} agora={agora} onBaixado={handleBaixado} />
            })}
          </div>
        </section>
      ) : (
        <InlineAlert
          tone="info"
          title="Fila de cobrança vazia"
          description="Não há receitas pendentes no resultado filtrado. Ajuste filtros ou registre novos lançamentos."
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {['', 'receita', 'despesa'].map((t) => (
            <Link key={t} href={buildUrl({ tipo: t, page: 1 })}>
              <Button variant={tipo === t ? 'default' : 'outline'} size="sm" className="h-8 text-xs">
                {t === '' ? 'Todos os tipos' : TIPO_MAP[t]?.label ?? t}
              </Button>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {['', 'pendente', 'pago', 'cancelado'].map((s) => (
            <Link key={s} href={buildUrl({ status: s, page: 1 })}>
              <Button variant={status === s ? 'default' : 'outline'} size="sm" className="h-8 text-xs">
                {s === '' ? 'Qualquer status' : STATUS_MAP[s]?.label ?? s}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-border/80">
        <button
          type="button"
          onClick={() => {
            if (filaCobranca.length === 0) return
            setListaCompletaAberta((v) => !v)
          }}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40"
        >
          <span>Lista completa de lançamentos ({total})</span>
          {tabelaLancamentosVisivel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {tabelaLancamentosVisivel ? (
          <div className="overflow-x-auto border-t border-border/60">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Descrição</th>
                  <th className="px-4 py-3 text-left font-medium">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium">Vencimento</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lancamentos.length === 0 ? (
                  <TableEmptyState
                    colSpan={7}
                    title="Nenhum lançamento encontrado"
                    description="Ajuste os filtros ou registre um novo lançamento."
                    action={{ label: 'Novo lançamento', href: '/financeiro/novo' }}
                  />
                ) : (
                  lancamentos.map((l) => {
                    const st = STATUS_MAP[l.status as string] ?? {
                      label: l.status as string,
                      variant: 'outline' as const,
                    }
                    const tip = TIPO_MAP[l.tipo as string] ?? {
                      label: l.tipo as string,
                      variant: 'outline' as const,
                    }
                    const dataVenc = tsToDate(l.dataVencimento)
                    const atrasado =
                      dataVenc && dataVenc < new Date() && l.status === 'pendente'

                    return (
                      <tr key={l.id as string} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{l.descricao as string}</td>
                        <td className="px-4 py-3 text-muted-foreground">{(l.clienteNome as string) ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={tip.variant}>{tip.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className={atrasado ? 'font-medium text-destructive' : ''}>
                            {dataVenc ? formatDate(dataVenc) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatCurrency(l.valor as number)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {l.status === 'pendente' ? (
                            <LancamentoBaixar
                              lancamentoId={l.id as string}
                              onBaixado={() => handleBaixado(l.id as string)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {totalPages > 1 && tabelaLancamentosVisivel ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={buildUrl({ page: page - 1 })}>
                <Button variant="outline" size="sm">
                  Anterior
                </Button>
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={buildUrl({ page: page + 1 })}>
                <Button variant="outline" size="sm">
                  Próxima
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function FinanceiroPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <FinanceiroContent />
    </Suspense>
  )
}
