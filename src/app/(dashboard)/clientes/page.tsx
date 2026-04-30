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

const REGIME_BADGE: Record<string, string> = {
  simples_nacional: 'bg-success/10 text-success border-success/25',
  lucro_presumido:  'bg-info/10 text-info border-info/25',
  lucro_real:       'bg-primary/10 text-foreground/70 border-primary/20',
  mei:              'bg-warning/10 text-warning border-warning/25',
  isento:           'bg-muted text-muted-foreground border-border',
}

function clienteInitials(razaoSocial: string): string {
  const words = razaoSocial.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const PAGE_SIZE = 20

function saudeCliente(c: Record<string, unknown>): {
  score: 0 | 1 | 2 | 3
  label: 'crítica' | 'atenção' | 'estável'
  reason: string
} {
  if ((c.status as string) === 'suspenso') {
    return { score: 0, label: 'crítica', reason: 'Cliente suspenso' }
  }
  if ((c.riscoInadimplencia as boolean) === true) {
    return { score: 1, label: 'atenção', reason: 'Risco de inadimplência acima de R$ 500' }
  }
  if ((c.status as string) === 'inativo') {
    return { score: 2, label: 'atenção', reason: 'Cliente inativo' }
  }
  return { score: 3, label: 'estável', reason: 'Sem alertas ativos' }
}

function ClientesContent() {
  const searchParams = useSearchParams()
  const busca  = searchParams.get('busca') ?? ''
  const status = searchParams.get('status') ?? ''
  const page   = parseInt(searchParams.get('page') ?? '1')

  const [allClientes, setAllClientes] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [modalClienteId,   setModalClienteId]   = useState<string | null>(null)
  const [modalClienteNome, setModalClienteNome] = useState('')

  useEffect(() => {
    setLoading(true)
    getClientes(status ? { status } : {})
      .then((data) => setAllClientes(data as Array<Record<string, unknown>>))
      .finally(() => setLoading(false))
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
            <Button size="sm" className="h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Cliente
            </Button>
          </Link>
        }
      />

      <div className="surface-subtle border px-3 py-2.5">
        <Suspense>
          <ClientesFiltros busca={busca} status={status} />
        </Suspense>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border/65 bg-card/95 card-shadow">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 section-label">Nome / Razão Social</th>
              <th className="text-left px-4 py-3 section-label">CPF / CNPJ</th>
              <th className="text-left px-4 py-3 section-label hidden md:table-cell">Regime</th>
              <th className="text-left px-4 py-3 section-label hidden lg:table-cell">Cidade / UF</th>
              <th className="text-left px-4 py-3 section-label">Status</th>
              <th className="text-left px-4 py-3 section-label">Saúde</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <TableRowSkeleton cols={7} rows={8} />
            ) : paginados.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={Users}
                title={busca || status ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'}
                description={busca || status
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Clique em "Novo Cliente" para começar.'}
                action={!busca && !status ? { label: 'Novo Cliente', href: '/clientes/novo' } : undefined}
              />
            ) : (
              paginados.map((c) => {
                const saude = saudeCliente(c)
                return (
                <tr
                  key={c.id as string}
                  className="cursor-pointer transition-colors hover:bg-muted/35"
                  onClick={() => { setModalClienteId(c.id as string); setModalClienteNome((c.razaoSocial as string) ?? '') }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-xs font-semibold text-primary">
                          {clienteInitials((c.razaoSocial as string) || '?')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.razaoSocial as string}</p>
                        {c.nomeFantasia ? (
                          <p className="text-xs text-muted-foreground truncate">{c.nomeFantasia as string}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {formatCpfCnpj(c.cpfCnpj as string)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {c.regimeTributario ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${REGIME_BADGE[c.regimeTributario as string] ?? REGIME_BADGE.isento}`}>
                        {REGIME_LABELS[c.regimeTributario as string] ?? (c.regimeTributario as string)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {c.cidade && c.uf ? `${c.cidade as string} / ${c.uf as string}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ClienteStatusBadge status={c.status as string} />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="inline-flex items-center gap-1.5"
                      title={`Saúde ${saude.label}: ${saude.reason}`}
                    >
                      {[1, 2, 3].map((dot) => (
                        <span
                          key={dot}
                          className={`h-2 w-2 rounded-full ${
                            dot <= saude.score
                              ? saude.score === 3
                                ? 'bg-success'
                                : saude.score === 2
                                  ? 'bg-warning'
                                  : 'bg-destructive'
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setModalClienteId(c.id as string)
                        setModalClienteNome((c.razaoSocial as string) ?? '')
                      }}
                    >
                      Ver
                    </Button>
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="surface-subtle mt-4 flex items-center justify-between border px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/clientes?${new URLSearchParams({ busca, status, page: String(page - 1) })}`}>
                <Button variant="outline" size="sm" className="h-9 rounded-xl">Anterior</Button>
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/clientes?${new URLSearchParams({ busca, status, page: String(page + 1) })}`}>
                <Button variant="outline" size="sm" className="h-9 rounded-xl">Próxima</Button>
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
