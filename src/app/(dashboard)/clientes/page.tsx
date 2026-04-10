'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { getClientes } from '@/lib/firestore-client'
import { formatCpfCnpj } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClientesFiltros } from '@/components/clientes/clientes-filtros'
import { ClienteModal } from '@/components/clientes/cliente-modal'
import { Plus, Loader2 } from 'lucide-react'

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

const PAGE_SIZE = 20

function ClientesContent() {
  const searchParams = useSearchParams()
  const busca = searchParams.get('busca') ?? ''
  const status = searchParams.get('status') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')

  const [allClientes, setAllClientes] = useState<Array<Record<string, string>>>([])
  const [loading, setLoading] = useState(true)
  const [modalClienteId, setModalClienteId] = useState<string | null>(null)
  const [modalClienteNome, setModalClienteNome] = useState('')

  useEffect(() => {
    setLoading(true)
    getClientes(status ? { status } : {})
      .then((data) => setAllClientes(data as Array<Record<string, string>>))
      .finally(() => setLoading(false))
  }, [status])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

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

  const total = clientes.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const paginados = clientes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setModalClienteId(c.id)
                        setModalClienteNome(c.razaoSocial)
                      }}
                    >
                      Ver
                    </Button>
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
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <ClientesContent />
    </Suspense>
  )
}
