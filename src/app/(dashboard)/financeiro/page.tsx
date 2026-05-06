'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

import { formatDate, formatCurrency, tsToDate } from '@/lib/utils'
import { exportToExcel } from '@/lib/export-excel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LancamentoBaixar } from '@/components/financeiro/lancamento-baixar'
import { FilaCobrancaItem } from '@/components/financeiro/fila-cobranca'
import { Download, Plus, TrendingUp, CheckCircle, AlertTriangle, Receipt } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'
import { financeiroBaseFiltroSchema } from '@/features/financeiro/schemas'
import { useFinanceiroList } from '@/features/financeiro/hooks'
import { financeiroKeys } from '@/features/financeiro/queries'
import { scoreCobranca } from '@/lib/financeiro-prioridade'

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

function FinanceiroContent() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const parsed = financeiroBaseFiltroSchema.parse({
    clienteId: searchParams.get('clienteId') ?? '',
    competenciaId: searchParams.get('competenciaId') ?? '',
  })
  const { clienteId, competenciaId } = parsed
  const [tipo, setTipo] = useState(() => searchParams.get('tipo') ?? '')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '')
  const [page, setPage] = useState(1)
  const { lancamentos, filteredLancamentos, total, totalPages, somaAReceber, somaRecebidoMes, somaEmAtraso, isLoading } =
    useFinanceiroList({ clienteId, competenciaId, tipo, status, page })
  const agora = new Date()
  const filaCobranca = [...filteredLancamentos]
    .filter((l) => l.tipo === 'receita' && l.status === 'pendente')
    .sort((a, b) => scoreCobranca(b, agora) - scoreCobranca(a, agora))
    .slice(0, 5)

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

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            {total} lançamento{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={exportarInadimplencia}>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">A Receber</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value">{formatCurrency(somaAReceber)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recebido no Mês
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value text-success">{formatCurrency(somaRecebidoMes)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/65 bg-card/95 card-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Atraso</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="kpi-value text-destructive">{formatCurrency(somaEmAtraso)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="surface-subtle flex flex-wrap items-center gap-3 border px-3 py-2.5">
        <div className="flex items-center gap-1">
          {(['', 'receita', 'despesa'] as const).map((t) => (
            <FilterBtn key={t} onClick={() => { setTipo(t); setPage(1) }} active={tipo === t}>
              {t === '' ? 'Todos' : TIPO_MAP[t]?.label ?? t}
            </FilterBtn>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['', 'pendente', 'atrasado', 'pago', 'cancelado', 'estornado'] as const).map((s) => (
            <FilterBtn key={s} onClick={() => { setStatus(s); setPage(1) }} active={status === s}>
              {s === '' ? 'Qualquer' : STATUS_MAP[s]?.label ?? s}
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
            <Button variant="outline" size="sm" onClick={() => { setTipo('receita'); setStatus('pendente'); setPage(1) }}>
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

      <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left section-label">Descrição</th>
              <th className="px-4 py-3 text-left section-label">Cliente</th>
              <th className="px-4 py-3 text-left section-label">Tipo</th>
              <th className="px-4 py-3 text-left section-label">Vencimento</th>
              <th className="px-4 py-3 text-right section-label">Valor</th>
              <th className="px-4 py-3 text-left section-label">Status</th>
              <th className="px-4 py-3 text-left section-label">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <TableRowSkeleton cols={7} rows={8} />
            ) : lancamentos.length === 0 ? (
              <TableEmptyState
                colSpan={7}
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
                const tip = TIPO_MAP[l.tipo as string] ?? {
                  label: l.tipo as string,
                  variant: 'outline' as const,
                }
                const dataVenc = tsToDate(l.dataVencimento)
                const atrasado =
                  dataVenc &&
                  dataVenc < new Date() &&
                  l.status === 'pendente'

                return (
                  <tr key={l.id as string} className="transition-colors hover:bg-muted/35">
                    <td className="px-4 py-3 font-medium">{l.descricao as string}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(l.clienteNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tip.variant}>{tip.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={atrasado ? 'text-destructive font-medium' : ''}>
                        {dataVenc ? formatDate(dataVenc) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(l.valor as number)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {l.status === 'pendente' ? (
                        <LancamentoBaixar
                          lancamentoId={l.id as string}
                          valor={l.valor as number}
                          clienteNome={l.clienteNome as string | undefined}
                          descricao={l.descricao as string | undefined}
                          dataVencimento={l.dataVencimento as Timestamp | undefined}
                          onBaixado={() =>
                            void queryClient.invalidateQueries({
                              queryKey: financeiroKeys.snapshot({ clienteId, competenciaId, tipo, status, page }),
                            })
                          }
                        />
                      ) : null}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                Anterior
              </Button>
            ) : null}
            {page < totalPages ? (
              <Button variant="outline" size="sm" onClick={() => setPage((prev) => prev + 1)}>
                Próxima
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
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
