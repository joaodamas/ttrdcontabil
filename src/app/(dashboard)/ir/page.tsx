'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { listDocuments } from '@/lib/firestore-client'
import { formatDate , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  entregue: { label: 'Entregue', variant: 'default' },
  retificado: { label: 'Retificado', variant: 'secondary' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
}

const PAGE_SIZE = 20

function IrContent() {
  const searchParams = useSearchParams()
  const anoBaseAtual = new Date().getFullYear() - 1
  const anoBase = searchParams.get('anoBase') ? parseInt(searchParams.get('anoBase')!) : anoBaseAtual
  const status = searchParams.get('status') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allDeclaracoes, setAllDeclaracoes] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const anosDisponiveis = [anoBaseAtual, anoBaseAtual - 1, anoBaseAtual - 2, anoBaseAtual - 3]

  useEffect(() => {
    setLoading(true)
    const constraints = [
      where('anoBase', '==', anoBase),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('clienteNome', 'asc'),
    ]
    listDocuments('ir_declaracoes', constraints)
      .then((data) => setAllDeclaracoes(data as Array<Record<string, unknown>>))
      .finally(() => setLoading(false))
  }, [anoBase, status])

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      anoBase: String(anoBase),
      ...(status && { status }),
      page: String(page),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/ir?${params.toString()}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  const total = allDeclaracoes.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const declaracoes = allDeclaracoes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
                      {dataEntrega ? formatDate(tsToDate(dataEntrega)) : '—'}
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

export default function IrPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <IrContent />
    </Suspense>
  )
}
