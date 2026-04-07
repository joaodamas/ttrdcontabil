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
  concluida: { label: 'Concluída', variant: 'default' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
}

const PRIORIDADE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  baixa: { label: 'Baixa', variant: 'outline' },
  normal: { label: 'Normal', variant: 'secondary' },
  alta: { label: 'Alta', variant: 'destructive' },
  urgente: { label: 'Urgente', variant: 'destructive' },
}

interface SearchParams {
  status?: string
  prioridade?: string
  responsavelId?: string
  clienteId?: string
  competenciaId?: string
  page?: string
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth()
  const sp = await searchParams

  const status = sp.status ?? ''
  const prioridade = sp.prioridade ?? ''
  const responsavelId = sp.responsavelId ?? ''
  const clienteId = sp.clienteId ?? ''
  const competenciaId = sp.competenciaId ?? ''
  const page = parseInt(sp.page ?? '1')
  const limit = 20

  const hoje = new Date()

  let query = adminDb.collection('tarefas') as FirebaseFirestore.Query

  if (status) query = query.where('status', '==', status)
  if (prioridade) query = query.where('prioridade', '==', prioridade)
  if (responsavelId) query = query.where('responsavelId', '==', responsavelId)
  if (clienteId) query = query.where('clienteId', '==', clienteId)
  if (competenciaId) query = query.where('competenciaId', '==', competenciaId)

  query = query.orderBy('dataPrazo', 'asc')

  const snap = await query.get()
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>
  const total = all.length
  const totalPages = Math.ceil(total / limit)
  const tarefas = all.slice((page - 1) * limit, page * limit)

  function buildUrl(overrides: Record<string, string | number>) {
    const params = new URLSearchParams({
      ...(status && { status }),
      ...(prioridade && { prioridade }),
      ...(responsavelId && { responsavelId }),
      ...(clienteId && { clienteId }),
      ...(competenciaId && { competenciaId }),
      page: String(page),
      ...overrides,
    })
    return `/tarefas?${params.toString()}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tarefas</h2>
          <p className="text-sm text-muted-foreground">
            {total} tarefa{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/tarefas/nova">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Nova Tarefa
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {['', 'pendente', 'em_andamento', 'concluida', 'cancelada'].map((s) => (
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

        <div className="flex items-center gap-1">
          {['', 'baixa', 'normal', 'alta', 'urgente'].map((p) => (
            <Link key={p} href={buildUrl({ prioridade: p, page: 1 })}>
              <Button
                variant={prioridade === p ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
              >
                {p === '' ? 'Qualquer' : PRIORIDADE_MAP[p]?.label ?? p}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Título</th>
              <th className="px-4 py-3 text-left font-medium">Cliente</th>
              <th className="px-4 py-3 text-left font-medium">Prioridade</th>
              <th className="px-4 py-3 text-left font-medium">Responsável</th>
              <th className="px-4 py-3 text-left font-medium">Prazo</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tarefas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma tarefa encontrada.
                </td>
              </tr>
            ) : tarefas.map((t) => {
                const st = STATUS_MAP[t.status as string] ?? {
                  label: t.status as string,
                  variant: 'outline' as const,
                }
                const pr = PRIORIDADE_MAP[t.prioridade as string] ?? {
                  label: (t.prioridade as string) ?? '—',
                  variant: 'outline' as const,
                }
                const dataPrazo = t.dataPrazo as Timestamp | undefined
                const vencida =
                  dataPrazo &&
                  dataPrazo.toDate() < hoje &&
                  !['concluida', 'cancelada'].includes(t.status as string)

                return (
                  <tr key={t.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/tarefas/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.titulo as string}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(t.clienteNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {t.prioridade ? (
                        <Badge variant={pr.variant}>{pr.label}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(t.responsavelNome as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {dataPrazo ? (
                        <span className={vencida ? 'text-destructive font-medium' : ''}>
                          {formatDate(dataPrazo.toDate())}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
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
