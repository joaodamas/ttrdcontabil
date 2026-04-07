export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Timestamp } from 'firebase-admin/firestore'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  entregue: { label: 'Entregue', variant: 'default' },
  retificado: { label: 'Retificado', variant: 'secondary' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
}

interface SearchParams {
  anoBase?: string
  status?: string
  page?: string
}

export default async function IrPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth()
  const sp = await searchParams

  const anoBaseAtual = new Date().getFullYear() - 1
  const anoBase = sp.anoBase ? parseInt(sp.anoBase) : anoBaseAtual
  const status = sp.status ?? ''
  const page = parseInt(sp.page ?? '1')
  const limit = 20

  let query = adminDb.collection('ir_declaracoes') as FirebaseFirestore.Query
  query = query.where('anoBase', '==', anoBase)

  if (status) query = query.where('status', '==', status)

  query = query.orderBy('clienteNome', 'asc')

  const snap = await query.get()
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>
  const total = all.length
  const totalPages = Math.ceil(total / limit)
  const declaracoes = all.slice((page - 1) * limit, page * limit)

  const anosDisponiveis = [anoBaseAtual, anoBaseAtual - 1, anoBaseAtual - 2, anoBaseAtual - 3]

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      anoBase: String(anoBase),
      ...(status && { status }),
      page: String(page),
      ...overrides,
    })
    return `/ir?${params.toString()}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Declarações de IR</h2>
          <p className="text-sm text-muted-foreground">
            {total} declaraç{total !== 1 ? 'ões' : 'ão'} — Ano-base {anoBase}
          </p>
        </div>
        <Link href="/ir/nova">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Nova Declaração
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {anosDisponiveis.map((a) => (
            <Link key={a} href={buildUrl({ anoBase: a, page: 1 })}>
              <Button
                variant={anoBase === a ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
              >
                {a}
              </Button>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {['', 'pendente', 'em_andamento', 'entregue', 'retificado', 'cancelado'].map((s) => (
            <Link key={s} href={buildUrl({ status: s, page: 1 })}>
              <Button
                variant={status === s ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
              >
                {s === '' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cliente</th>
              <th className="px-4 py-3 text-left font-medium">Ano-base</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Responsável</th>
              <th className="px-4 py-3 text-left font-medium">Data Entrega</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {declaracoes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma declaração encontrada.
                </td>
              </tr>
            ) : (
              declaracoes.map((d) => {
                const s = STATUS_MAP[d.status as string] ?? {
                  label: d.status as string,
                  variant: 'outline' as const,
                }
                const dataEntrega = d.dataEntrega as Timestamp | undefined
                return (
                  <tr key={d.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/ir/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {(d.clienteNome as string) ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{d.anoBase as number}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(d.responsavelNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {dataEntrega ? formatDate(dataEntrega.toDate()) : '—'}
                    </td>
                  </tr>
                )
              })
            )}
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
