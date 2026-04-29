'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { getClientes } from '@/lib/firestore-client'
import { formatCpfCnpj } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ClienteStatusBadge } from '@/components/ui/status-badge'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { ClientesFiltros } from '@/components/clientes/clientes-filtros'
import { ClienteModal } from '@/components/clientes/cliente-modal'
import { Plus, Users } from 'lucide-react'

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples',
  lucro_presumido: 'L. Presumido',
  lucro_real: 'L. Real',
  mei: 'MEI',
  isento: 'Isento',
}

const PAGE_SIZE = 20

function ClientesContent() {
  const searchParams = useSearchParams()
  const busca  = searchParams.get('busca') ?? ''
  const status = searchParams.get('status') ?? ''
  const page   = parseInt(searchParams.get('page') ?? '1')

  const [allClientes, setAllClientes] = useState<Array<Record<string, string>>>([])
  const [loading, setLoading] = useState(true)
  const [modalClienteId,   setModalClienteId]   = useState<string | null>(null)
  const [modalClienteNome, setModalClienteNome] = useState('')

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true)
      getClientes(status ? { status } : {})
        .then((data) => setAllClientes(data as Array<Record<string, string>>))
        .finally(() => setLoading(false))
    })
  }, [status])

  let clientes = allClientes
  if (busca) {
    const buscaLower = busca.toLowerCase()
    clientes = clientes.filter(
      (c) =>
        String(c.razaoSocial ?? '').toLowerCase().includes(buscaLower) ||
        String(c.nomeFantasia ?? '').toLowerCase().includes(buscaLower) ||
        String(c.cpfCnpj ?? '').includes(busca.replace(/\D/g, ''))
    )
  }

  const total      = clientes.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const paginados  = clientes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={loading ? undefined : `${total} cliente${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        action={
          <Link href="/clientes/novo">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Cliente
            </Button>
          </Link>
        }
      />

      <Suspense>
        <ClientesFiltros busca={busca} status={status} />
      </Suspense>

      <div className="rounded-lg border bg-card overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome / Razão Social</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF / CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Regime</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cidade / UF</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <TableRowSkeleton cols={6} rows={8} />
            ) : paginados.length === 0 ? (
              <TableEmptyState
                colSpan={6}
                icon={Users}
                title={busca || status ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'}
                description={busca || status
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Clique em "Novo Cliente" para começar.'}
                action={!busca && !status ? { label: 'Novo Cliente', href: '/clientes/novo' } : undefined}
              />
            ) : (
              paginados.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => { setModalClienteId(c.id); setModalClienteNome(c.razaoSocial) }}
                >
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
                    <ClienteStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setModalClienteId(c.id)
                        setModalClienteNome(c.razaoSocial)
                      }}
                    >
                      Ver
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm mt-4">
          <span className="text-muted-foreground">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/clientes?${new URLSearchParams({ busca, status, page: String(page - 1) })}`}>
                <Button variant="outline" size="sm">Anterior</Button>
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/clientes?${new URLSearchParams({ busca, status, page: String(page + 1) })}`}>
                <Button variant="outline" size="sm">Próxima</Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {modalClienteId && (
        <ClienteModal
          clienteId={modalClienteId}
          clienteNome={modalClienteNome}
          open={!!modalClienteId}
          onOpenChange={(v) => { if (!v) setModalClienteId(null) }}
        />
      )}
    </div>
  )
}

export default function ClientesPage() {
  return (
    <Suspense>
      <ClientesContent />
    </Suspense>
  )
}
