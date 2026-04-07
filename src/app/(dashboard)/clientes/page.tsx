export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { formatCpfCnpj } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClientesFiltros } from '@/components/clientes/clientes-filtros'
import { Plus } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo: { label: 'Ativo', variant: 'default' },
  inativo: { label: 'Inativo', variant: 'secondary' },
  suspenso: { label: 'Suspenso', variant: 'destructive' },
}

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples',
  lucro_presumido: 'L. Presumido',
  lucro_real: 'L. Real',
  mei: 'MEI',
  isento: 'Isento',
}

interface SearchParams {
  busca?: string
  status?: string
  page?: string
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth()
  const sp = await searchParams
  const busca = sp.busca ?? ''
  const status = sp.status ?? ''
  const page = parseInt(sp.page ?? '1')
  const limit = 20

  let query = adminDb.collection('clientes').orderBy('razaoSocial') as FirebaseFirestore.Query

  if (status) {
    query = query.where('status', '==', status)
  }

  const snap = await query.get()
  let clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, string>>

  if (busca) {
    const buscaLower = busca.toLowerCase()
    clientes = clientes.filter(
      (c) =>
        String(c.razaoSocial ?? '').toLowerCase().includes(buscaLower) ||
        String(c.nomeFantasia ?? '').toLowerCase().includes(buscaLower) ||
        String(c.cpfCnpj ?? '').includes(busca.replace(/\D/g, ''))
    )
  }

  const total = clientes.length
  const totalPages = Math.ceil(total / limit)
  const paginados = clientes.slice((page - 1) * limit, page * limit)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {total} cliente{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/clientes/novo">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Novo Cliente
          </Button>
        </Link>
      </div>

      <Suspense>
        <ClientesFiltros busca={busca} status={status} />
      </Suspense>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Nome / Razão Social
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF / CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                Regime
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                Cidade / UF
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginados.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhum cliente encontrado
                </td>
              </tr>
            )}
            {paginados.map((c) => {
              const statusInfo =
                STATUS_LABELS[c.status] ?? { label: c.status, variant: 'outline' as const }
              return (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{c.razaoSocial}</p>
                      {c.nomeFantasia ? (
                        <p className="text-xs text-muted-foreground">{c.nomeFantasia}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {formatCpfCnpj(c.cpfCnpj)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {c.regimeTributario ? REGIME_LABELS[c.regimeTributario] ?? c.regimeTributario : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {c.cidade && c.uf ? `${c.cidade} / ${c.uf}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${c.id}`}>
                      <Button variant="ghost" size="sm">
                        Ver
                      </Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/clientes?${new URLSearchParams({ busca, status, page: String(page - 1) })}`}
              >
                <Button variant="outline" size="sm">
                  Anterior
                </Button>
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/clientes?${new URLSearchParams({ busca, status, page: String(page + 1) })}`}
              >
                <Button variant="outline" size="sm">
                  Próxima
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
