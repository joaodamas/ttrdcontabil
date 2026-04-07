export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LancamentoBaixar } from '@/components/financeiro/lancamento-baixar'
import { Plus, TrendingUp, CheckCircle, AlertTriangle } from 'lucide-react'

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

interface SearchParams {
  tipo?: string
  status?: string
  clienteId?: string
  competenciaId?: string
  page?: string
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth()
  const sp = await searchParams

  const tipo = sp.tipo ?? ''
  const status = sp.status ?? ''
  const clienteId = sp.clienteId ?? ''
  const competenciaId = sp.competenciaId ?? ''
  const page = parseInt(sp.page ?? '1')
  const limit = 20

  const hoje = new Date()
  const hojeTs = Timestamp.fromDate(hoje)
  const inicioMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const fimMes = Timestamp.fromDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59))

  let query = adminDb.collection('lancamentos') as FirebaseFirestore.Query

  if (tipo) query = query.where('tipo', '==', tipo)
  if (status) query = query.where('status', '==', status)
  if (clienteId) query = query.where('clienteId', '==', clienteId)
  if (competenciaId) query = query.where('competenciaId', '==', competenciaId)

  query = query.orderBy('dataVencimento', 'asc')

  const [snap, aReceberSnap, recebidoMesSnap, emAtrasoSnap] = await Promise.all([
    query.get(),
    adminDb
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pendente')
      .get(),
    adminDb
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pago')
      .where('dataPagamento', '>=', inicioMes)
      .where('dataPagamento', '<=', fimMes)
      .get(),
    adminDb
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pendente')
      .where('dataVencimento', '<', hojeTs)
      .get(),
  ])

  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>
  const total = all.length
  const totalPages = Math.ceil(total / limit)
  const lancamentos = all.slice((page - 1) * limit, page * limit)

  const somaAReceber = aReceberSnap.docs.reduce(
    (acc, d) => acc + ((d.data().valor as number) ?? 0),
    0
  )
  const somaRecebidoMes = recebidoMesSnap.docs.reduce(
    (acc, d) => acc + ((d.data().valor as number) ?? 0),
    0
  )
  const somaEmAtraso = emAtrasoSnap.docs.reduce(
    (acc, d) => acc + ((d.data().valor as number) ?? 0),
    0
  )

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      ...(tipo && { tipo }),
      ...(status && { status }),
      ...(clienteId && { clienteId }),
      ...(competenciaId && { competenciaId }),
      page: String(page),
      ...overrides,
    })
    return `/financeiro?${params.toString()}`
  }

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
            <p className="text-2xl font-bold text-green-600">{formatCurrency(somaRecebidoMes)}</p>
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
          {['', 'receita', 'despesa'].map((t) => (
            <Link key={t} href={buildUrl({ tipo: t, page: 1 })}>
              <Button
                variant={tipo === t ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
              >
                {t === '' ? 'Todos' : TIPO_MAP[t]?.label ?? t}
              </Button>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {['', 'pendente', 'pago', 'cancelado'].map((s) => (
            <Link key={s} href={buildUrl({ status: s, page: 1 })}>
              <Button
                variant={status === s ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
              >
                {s === '' ? 'Qualquer' : STATUS_MAP[s]?.label ?? s}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
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
          <tbody className="divide-y">
            {lancamentos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum lançamento encontrado.
                </td>
              </tr>
            ) : lancamentos.map((l) => {
                const st = STATUS_MAP[l.status as string] ?? {
                  label: l.status as string,
                  variant: 'outline' as const,
                }
                const tip = TIPO_MAP[l.tipo as string] ?? {
                  label: l.tipo as string,
                  variant: 'outline' as const,
                }
                const dataVenc = l.dataVencimento as Timestamp | undefined
                const atrasado =
                  dataVenc &&
                  dataVenc.toDate() < hoje &&
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
                        {dataVenc ? formatDate(dataVenc.toDate()) : '—'}
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
                        <LancamentoBaixar lancamentoId={l.id as string} />
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
