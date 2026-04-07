export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { formatMesAno } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  aberta: { label: 'Aberta', variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  concluida: { label: 'Concluída', variant: 'default' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
}

interface SearchParams {
  mes?: string
  ano?: string
  status?: string
  clienteId?: string
  page?: string
}

export default async function CompetenciasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth()
  const sp = await searchParams

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const mes = sp.mes ? parseInt(sp.mes) : mesAtual
  const ano = sp.ano ? parseInt(sp.ano) : anoAtual
  const status = sp.status ?? ''
  const clienteId = sp.clienteId ?? ''
  const page = parseInt(sp.page ?? '1')
  const limit = 20

  let query = adminDb.collection('competencias') as FirebaseFirestore.Query
  query = query.where('mes', '==', mes).where('ano', '==', ano)

  if (status) query = query.where('status', '==', status)
  if (clienteId) query = query.where('clienteId', '==', clienteId)

  query = query.orderBy('clienteNome', 'asc')

  const snap = await query.get()
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>
  const total = all.length
  const totalPages = Math.ceil(total / limit)
  const competencias = all.slice((page - 1) * limit, page * limit)

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      mes: String(mes),
      ano: String(ano),
      ...(status && { status }),
      ...(clienteId && { clienteId }),
      page: String(page),
      ...overrides,
    })
    return `/competencias?${params.toString()}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Competências</h2>
          <p className="text-sm text-muted-foreground">
            {total} competência{total !== 1 ? 's' : ''} — {formatMesAno(mes, ano)}
          </p>
        </div>
        <Link href="/competencias/nova">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Nova Competência
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={buildUrl(
              mes === 1 ? { mes: 12, ano: ano - 1, page: 1 } : { mes: mes - 1, page: 1 }
            )}
          >
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="px-3 text-sm font-medium">{formatMesAno(mes, ano)}</span>
          <Link
            href={buildUrl(
              mes === 12 ? { mes: 1, ano: ano + 1, page: 1 } : { mes: mes + 1, page: 1 }
            )}
          >
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {['', 'aberta', 'em_andamento', 'concluida', 'cancelada'].map((s) => (
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
              <th className="px-4 py-3 text-left font-medium">Serviço</th>
              <th className="px-4 py-3 text-left font-medium">Mês/Ano</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {competencias.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma competência encontrada.
                </td>
              </tr>
            ) : (
              competencias.map((c) => {
                const s = STATUS_MAP[c.status as string] ?? {
                  label: c.status as string,
                  variant: 'outline' as const,
                }
                return (
                  <tr key={c.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/competencias/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {(c.clienteNome as string) ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.servicoNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {formatMesAno(c.mes as number, c.ano as number)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.responsavelNome as string) ?? '—'}
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
