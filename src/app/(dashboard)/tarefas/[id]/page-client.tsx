'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatDate, formatMesAno } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TarefaComentarios } from '@/components/tarefas/tarefa-comentarios'
import { ArrowLeft, Pencil, Loader2 } from 'lucide-react'

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

export default function TarefaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [tarefa, setTarefa] = useState<Record<string, unknown> | null>(null)
  const [comentariosSerializados, setComentariosSerializados] = useState<Array<{ id: string; texto: string; criadoEm: string; usuarioNome: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getDocument('tarefas', id),
      listDocuments('tarefas_comentarios', [
        where('tarefaId', '==', id),
        orderBy('criadoEm', 'asc'),
      ]),
    ]).then(([tarefaData, comentariosData]) => {
      if (!tarefaData) {
        router.push('/tarefas')
        return
      }
      setTarefa(tarefaData as Record<string, unknown>)
      const serialized = (comentariosData as Array<Record<string, unknown>>).map((d) => ({
        id: d.id as string,
        texto: d.texto as string,
        criadoEm: d.criadoEm ? (d.criadoEm as Timestamp).toDate().toISOString() : new Date().toISOString(),
        usuarioNome: (d.usuarioNome as string) ?? '—',
      }))
      setComentariosSerializados(serialized)
    }).finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!tarefa) return null

  const hoje = new Date()
  const dataPrazo = tarefa.dataPrazo as Timestamp | undefined
  const st = STATUS_MAP[tarefa.status as string] ?? {
    label: tarefa.status as string,
    variant: 'outline' as const,
  }
  const pr = tarefa.prioridade
    ? PRIORIDADE_MAP[tarefa.prioridade as string] ?? null
    : null

  const vencida =
    dataPrazo &&
    dataPrazo.toDate() < hoje &&
    !['concluida', 'cancelada'].includes(tarefa.status as string)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/tarefas">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{tarefa.titulo as string}</h2>
              <Badge variant={st.variant}>{st.label}</Badge>
              {pr ? <Badge variant={pr.variant}>{pr.label}</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {(tarefa.clienteNome as string) ?? 'Sem cliente'}
            </p>
          </div>
        </div>
        <Link href={`/tarefas/${id}/editar`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
        </Link>
      </div>

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
                {pr ? (
                  <Badge variant={pr.variant}>{pr.label}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Prazo</p>
                {dataPrazo ? (
                  <p className={`font-medium ${vencida ? 'text-destructive' : ''}`}>
                    {formatDate(dataPrazo.toDate())}
                    {vencida ? ' (vencida)' : ''}
                  </p>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>

              {tarefa.criadoEm ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Criada em</p>
                  <p className="text-muted-foreground">
                    {formatDate((tarefa.criadoEm as Timestamp).toDate())}
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
