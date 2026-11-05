'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatDate, tsToDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { TarefaPrioridadeBadge, TarefaStatusBadge } from '@/components/ui/status-badge'
import { RecordUnavailable, type RecordLoadFailure } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TarefaComentarios } from '@/components/tarefas/tarefa-comentarios'
import { Pencil, Loader2 } from 'lucide-react'

export default function TarefaDetalhePage() {
  const { id } = useParams<{ id: string }>()

  const [tarefa, setTarefa] = useState<Record<string, unknown> | null>(null)
  const [comentariosSerializados, setComentariosSerializados] = useState<Array<{ id: string; texto: string; criadoEm: string; usuarioNome: string }>>([])
  const [loading, setLoading] = useState(true)
  const [falha, setFalha] = useState<{ reason: RecordLoadFailure; message?: string } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => {
      setLoading(true)
      setFalha(null)
      Promise.all([
        getDocument('tarefas', id),
        listDocuments('tarefas_comentarios', [
          where('tarefaId', '==', id),
          orderBy('criadoEm', 'asc'),
        ]),
      ]).then(([tarefaData, comentariosData]) => {
        if (!tarefaData) {
          setTarefa(null)
          setFalha({ reason: 'nao_encontrado' })
          return
        }
        setTarefa(tarefaData as Record<string, unknown>)
        const serialized = (comentariosData as Array<Record<string, unknown>>).map((d) => ({
          id: d.id as string,
          texto: d.texto as string,
          criadoEm: d.criadoEm ? (tsToDate(d.criadoEm) ?? new Date()).toISOString() : new Date().toISOString(),
          usuarioNome: (d.usuarioNome as string) ?? '—',
        }))
        setComentariosSerializados(serialized)
      }).catch((err: unknown) => {
        console.error('[tarefas/detalhe] falha ao carregar', err)
        setTarefa(null)
        setFalha({ reason: 'erro', message: getErrorMessage(err, 'Verifique sua conexão e tente novamente.') })
      }).finally(() => setLoading(false))
    })
  }, [id, tentativa])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!tarefa) {
    return (
      <RecordUnavailable
        reason={falha?.reason ?? 'nao_encontrado'}
        notFoundTitle="Tarefa não encontrada"
        errorTitle="Não foi possível carregar a tarefa"
        errorDescription={falha?.message}
        backHref="/tarefas"
        backLabel="Voltar para tarefas"
        onRetry={() => setTentativa((n) => n + 1)}
      />
    )
  }

  const hoje = new Date()
  const dataPrazo = tarefa.dataPrazo as Timestamp | undefined

  const vencida =
    dataPrazo &&
    tsToDate(dataPrazo)! < hoje &&
    !['concluida', 'cancelada'].includes(tarefa.status as string)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Tarefas', href: '/tarefas' }, { label: tarefa.titulo as string }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tarefa.titulo as string}
              <TarefaStatusBadge status={tarefa.status as string} />
              {tarefa.prioridade ? <TarefaPrioridadeBadge prioridade={tarefa.prioridade as string} /> : null}
          </span>
        }
        description={(tarefa.clienteNome as string) ?? 'Sem cliente'}
        action={
          <Link href={`/tarefas/${id}/editar`} className={buttonVariants({ variant: 'outline', size: 'cta' })}>
            <Pencil />
            Editar
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              {tarefa.descricao ? (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {tarefa.descricao as string}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sem descrição.</p>
              )}
            </CardContent>
          </Card>

          <TarefaComentarios tarefaId={id} comentariosIniciais={comentariosSerializados} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Cliente</p>
                {tarefa.clienteId ? (
                  <Link
                    href={`/clientes/${tarefa.clienteId}`}
                    className="font-medium hover:underline"
                  >
                    {(tarefa.clienteNome as string) ?? '—'}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              {tarefa.competenciaId ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Competência
                  </p>
                  <Link
                    href={`/competencias/${tarefa.competenciaId}`}
                    className="font-medium hover:underline"
                  >
                    Ver competência
                  </Link>
                </div>
              ) : null}

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Responsável</p>
                <p className="font-medium">{(tarefa.responsavelNome as string) ?? '—'}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Prioridade</p>
                {tarefa.prioridade ? (
                  <TarefaPrioridadeBadge prioridade={tarefa.prioridade as string} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Prazo</p>
                {dataPrazo ? (
                  <p className={`font-medium ${vencida ? 'text-destructive' : ''}`}>
                    {formatDate(tsToDate(dataPrazo))}
                    {vencida ? ' (vencida)' : ''}
                  </p>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <TarefaStatusBadge status={tarefa.status as string} />
              </div>

              {tarefa.criadoEm ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Criada em</p>
                  <p className="text-muted-foreground">
                    {formatDate(tsToDate(tarefa.criadoEm))}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
