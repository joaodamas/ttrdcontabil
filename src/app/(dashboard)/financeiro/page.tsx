'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { getClientesByIds, listDocuments } from '@/lib/firestore-client'
import { formatDate, formatCurrency, tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LancamentoBaixar } from '@/components/financeiro/lancamento-baixar'
import { Plus, TrendingUp, CheckCircle, AlertTriangle, Loader2, Receipt } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { FilterBtn } from '@/components/ui/filter-btn'

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
  const clienteId = searchParams.get('clienteId') ?? ''
  const competenciaId = searchParams.get('competenciaId') ?? ''
  const [tipo, setTipo] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const [allLancamentos, setAllLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [somaAReceber, setSomaAReceber] = useState(0)
  const [somaRecebidoMes, setSomaRecebidoMes] = useState(0)
  const [somaEmAtraso, setSomaEmAtraso] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const hoje = new Date()
    const hojeTs = Timestamp.fromDate(hoje)
    const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))

    const constraints = [
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
    ]).then(async ([mainData, aReceberData, recebidoMesData, emAtrasoData]) => {
      const lancamentosRaw = mainData as Array<Record<string, unknown>>
      const clientesSemNome = [...new Set(
        lancamentosRaw
          .filter((l) => !l.clienteNome && typeof l.clienteId === 'string')
          .map((l) => l.clienteId as string)
      )]

      if (clientesSemNome.length > 0) {
        const clientes = await getClientesByIds(clientesSemNome)
        const clientePorId = new Map(
          clientes.map((c) => [
            c.id,
            {
              razaoSocial: c.razaoSocial as string | undefined,
              nomeFantasia: c.nomeFantasia as string | undefined,
            },
          ])
        )
        setAllLancamentos(
          lancamentosRaw.map((l) => {
            if (l.clienteNome || typeof l.clienteId !== 'string') return l
            const cliente = clientePorId.get(l.clienteId)
            const nome = cliente?.razaoSocial ?? cliente?.nomeFantasia
            return nome ? { ...l, clienteNome: nome } : l
          })
        )
      } else {
        setAllLancamentos(lancamentosRaw)
      }
      setSomaAReceber(aReceberData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0))
      setSomaRecebidoMes(recebidoMesData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0))
      setSomaEmAtraso(emAtrasoData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0))
    }).finally(() => setLoading(false))
  }, [clienteId, competenciaId])

  useEffect(() => {
    setPage(1)
  }, [tipo, status])

  const filteredLancamentos = useMemo(() => {
    return allLancamentos.filter((l) => {
      if (tipo && l.tipo !== tipo) return false
      if (status && l.status !== status) return false
      return true
    })
  }, [allLancamentos, tipo, status])

  const total = filteredLancamentos.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const lancamentos = filteredLancamentos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            {total} lançamento{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/financeiro/novo">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Novo Lançamento
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">A Receber</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(somaAReceber)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recebido no Mês
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{formatCurrency(somaRecebidoMes)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Atraso</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(somaEmAtraso)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(['', 'receita', 'despesa'] as const).map((t) => (
            <FilterBtn key={t} onClick={() => setTipo(t)} active={tipo === t}>
              {t === '' ? 'Todos' : TIPO_MAP[t]?.label ?? t}
            </FilterBtn>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['', 'pendente', 'pago', 'cancelado'] as const).map((s) => (
            <FilterBtn key={s} onClick={() => setStatus(s)} active={status === s}>
              {s === '' ? 'Qualquer' : STATUS_MAP[s]?.label ?? s}
            </FilterBtn>
          ))}
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
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
            {loading ? (
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
                  <tr key={l.id as string} className="hover:bg-muted/30 transition-colors">
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
                            setAllLancamentos((prev) =>
                              prev.map((x) =>
                                x.id === l.id ? { ...x, status: 'pago' } : x
                              )
                            )
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
