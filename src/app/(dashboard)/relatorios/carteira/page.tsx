'use client'

import Link from 'next/link'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock,
  PieChart, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { useCarteira } from '@/features/carteira/hooks'
import { KpiCard } from '@/components/ui/kpi-card'
import { InlineAlert } from '@/components/ui/inline-alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error-message'
import { cn } from '@/lib/utils'

/** Traço em vez de zero: zero é uma afirmação sobre o mundo, traço é ausência. */
const TRACO = '—'

function Secao({
  titulo, descricao, icone: Icone, children, acao,
}: {
  titulo: string
  descricao?: string
  icone: React.ComponentType<{ className?: string; size?: number }>
  children: React.ReactNode
  acao?: React.ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Icone size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </Card>
  )
}

export default function CarteiraPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useCarteira()

  const semDados = isError || !data
  const resumo = data?.resumo

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Carteira e receita recorrente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quanto entra por mês, de quem, e o que está prestes a sair.
          </p>
        </div>
      </header>

      {isError && (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar a carteira"
          description={getErrorMessage(error, 'Verifique a conexão e tente novamente.')}
          action={{ label: 'Tentar novamente', onClick: () => void refetch() }}
        />
      )}

      {data?.truncado && (
        <InlineAlert
          tone="warning"
          title="Carteira maior que o limite de leitura"
          description={`Foram lidos ${data.totalLido} contratos e há mais. Os números abaixo estão incompletos — me avise para paginar a leitura.`}
        />
      )}

      {/* Indicadores */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Receita recorrente"
          value={semDados ? TRACO : formatCurrency(resumo!.mrr)}
          icon={TrendingUp}
          tone="success"
          description={
            semDados
              ? 'Sem dado disponível.'
              : resumo!.mrrNaoMensal > 0
                ? `Inclui ${formatCurrency(resumo!.mrrNaoMensal)} de contrato anual ou trimestral, já dividido por mês.`
                : 'Só contratos vigentes. Avulso não entra.'
          }
        />
        <KpiCard
          label="Clientes com contrato"
          value={semDados ? TRACO : resumo!.clientesComContrato}
          icon={Users}
          description={semDados ? 'Sem dado disponível.' : `${resumo!.contratosVigentes} contrato(s) recorrente(s) vigente(s).`}
        />
        <KpiCard
          label="Ticket médio"
          value={semDados ? TRACO : formatCurrency(resumo!.ticketMedio)}
          icon={Wallet}
          description={semDados ? 'Sem dado disponível.' : 'Receita recorrente dividida pelos clientes com contrato.'}
        />
        <KpiCard
          label="Saldo do mês"
          value={semDados ? TRACO : formatCurrency(data!.movimento.saldo)}
          icon={data && data.movimento.saldo < 0 ? ArrowDownRight : ArrowUpRight}
          tone={semDados ? 'neutral' : data!.movimento.saldo < 0 ? 'danger' : 'success'}
          description={
            semDados
              ? 'Sem dado disponível.'
              : `Entraram ${formatCurrency(data!.movimento.mrrEntrou)}, saíram ${formatCurrency(data!.movimento.mrrSaiu)}.`
          }
        />
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground" aria-live="polite">Carregando carteira…</p>
      )}

      {!semDados && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Contratos vencendo */}
          <Secao
            titulo="Contratos vencendo"
            descricao="Receita que sai da carteira se nada for renovado."
            icone={CalendarClock}
            acao={
              isFetching ? <span className="text-xs text-muted-foreground">atualizando…</span> : undefined
            }
          >
            {data!.vencendo90.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nenhum contrato com data de fim nos próximos 90 dias"
                description="Contratos sem data de fim não aparecem aqui — eles seguem faturando até serem encerrados."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data!.vencendo90.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={cn(
                        'w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums',
                        c.diasRestantes <= 30
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-warning/15 text-warning',
                      )}
                    >
                      {c.diasRestantes}d
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clientes/${c.clienteId}`}
                        className="block truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {c.clienteNome ?? TRACO}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.servicoNome ?? TRACO} · termina {formatDate(c.dataFim)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatCurrency(c.mrrEmRisco)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data!.vencendo30.length > 0 && (
              <div className="flex items-center gap-2 border-t border-border bg-destructive/5 px-4 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-destructive" />
                <p className="text-xs text-destructive">
                  <strong>{data!.vencendo30.length}</strong> vence(m) em 30 dias, somando{' '}
                  <strong>{formatCurrency(data!.vencendo30.reduce((s, c) => s + c.mrrEmRisco, 0))}</strong> por mês.
                </p>
              </div>
            )}
          </Secao>

          {/* Concentração */}
          <Secao
            titulo="Concentração da receita"
            descricao="Quanto do faturamento depende de poucos clientes."
            icone={PieChart}
          >
            {data!.ranking.length === 0 ? (
              <EmptyState
                icon={PieChart}
                title="Nenhum contrato recorrente vigente"
                description="Cadastre um serviço na ficha de um cliente para a carteira aparecer aqui."
              />
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {data!.ranking.slice(0, 10).map((c, i) => (
                    <li key={c.clienteId} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/clientes/${c.clienteId}`}
                          className="block truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {c.clienteNome}
                        </Link>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(2, c.fatia * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatCurrency(c.mrr)}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {(c.fatia * 100).toFixed(1)}%
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {data!.ranking.length > 0 && (
                  <div className="border-t border-border px-4 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      Os 5 maiores somam{' '}
                      <strong className="text-foreground">
                        {(data!.ranking.slice(0, 5).reduce((s, c) => s + c.fatia, 0) * 100).toFixed(0)}%
                      </strong>{' '}
                      da receita recorrente.
                    </p>
                  </div>
                )}
              </>
            )}
          </Secao>

          {/* Movimento do mês */}
          <Secao
            titulo="Entradas e saídas do mês"
            descricao="Contratos que começaram ou terminaram neste mês."
            icone={Users}
          >
            {data!.movimento.entradas.length === 0 && data!.movimento.saidas.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nenhuma movimentação neste mês"
                description="A carteira está estável — nenhum contrato começou ou terminou."
              />
            ) : (
              <div className="grid gap-0 sm:grid-cols-2 sm:divide-x divide-border">
                <div>
                  <p className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-success">
                    <ArrowUpRight size={13} /> Entraram ({data!.movimento.entradas.length})
                  </p>
                  <ul className="divide-y divide-border">
                    {data!.movimento.entradas.slice(0, 6).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                        <span className="truncate text-sm">{c.clienteNome ?? TRACO}</span>
                        <span className="shrink-0 text-sm tabular-nums text-success">
                          +{formatCurrency(c.valor ?? 0)}
                        </span>
                      </li>
                    ))}
                    {data!.movimento.entradas.length === 0 && (
                      <li className="px-4 py-3 text-xs text-muted-foreground">Nenhum</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-destructive">
                    <ArrowDownRight size={13} /> Saíram ({data!.movimento.saidas.length})
                  </p>
                  <ul className="divide-y divide-border">
                    {data!.movimento.saidas.slice(0, 6).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                        <span className="truncate text-sm">{c.clienteNome ?? TRACO}</span>
                        <span className="shrink-0 text-sm tabular-nums text-destructive">
                          −{formatCurrency(c.valor ?? 0)}
                        </span>
                      </li>
                    ))}
                    {data!.movimento.saidas.length === 0 && (
                      <li className="px-4 py-3 text-xs text-muted-foreground">Nenhum</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </Secao>

          {/* Composição */}
          <Secao
            titulo="Composição da carteira"
            descricao="Como a receita recorrente se distribui."
            icone={Wallet}
          >
            <dl className="divide-y divide-border">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Contratos mensais</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatCurrency(resumo!.mrr - resumo!.mrrNaoMensal)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-sm text-muted-foreground">
                  Anuais e trimestrais
                  <span className="ml-1.5 text-xs">(divididos por mês)</span>
                </dt>
                <dd className="text-sm font-semibold tabular-nums">{formatCurrency(resumo!.mrrNaoMensal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-sm text-muted-foreground">
                  Contratos avulsos vigentes
                  <span className="ml-1.5 text-xs">(fora da receita recorrente)</span>
                </dt>
                <dd className="text-sm font-semibold tabular-nums">{resumo!.avulsosVigentes}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
                <dt className="text-sm font-semibold">Receita recorrente total</dt>
                <dd className="text-sm font-bold tabular-nums">{formatCurrency(resumo!.mrr)}</dd>
              </div>
            </dl>
          </Secao>
        </div>
      )}
    </div>
  )
}
