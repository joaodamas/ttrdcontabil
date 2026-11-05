'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, limit } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatDate, formatMesAno, formatCurrency , tsToDate } from '@/lib/utils'
import { CompetenciaStatusBadge, PagamentoStatusBadge, TarefaPrioridadeBadge, TarefaStatusBadge } from '@/components/ui/status-badge'
import { RecordUnavailable, type RecordLoadFailure } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function CompetenciaDetalhePage() {
  const { id } = useParams<{ id: string }>()

  const [competencia, setCompetencia] = useState<Record<string, unknown> | null>(null)
  const [tarefas, setTarefas] = useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [nfse, setNfse] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [falha, setFalha] = useState<{ reason: RecordLoadFailure; message?: string } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => {
      setLoading(true)
      setFalha(null)
      Promise.all([
        getDocument('competencias', id),
        listDocuments('tarefas', [where('competenciaId', '==', id), orderBy('criadoEm', 'asc'), limit(5)]),
        listDocuments('lancamentos', [where('competenciaId', '==', id), orderBy('dataVencimento', 'asc'), limit(5)]),
        listDocuments('nfse_emitidas', [where('competenciaId', '==', id), orderBy('criadoEm', 'desc'), limit(3)]),
      ]).then(([compData, tarefasData, lancamentosData, nfseData]) => {
        if (!compData) {
          setCompetencia(null)
          setFalha({ reason: 'nao_encontrado' })
          return
        }
        setCompetencia(compData as Record<string, unknown>)
        setTarefas(tarefasData as Array<Record<string, unknown>>)
        setLancamentos(lancamentosData as Array<Record<string, unknown>>)
        setNfse(nfseData as Array<Record<string, unknown>>)
      }).catch((err: unknown) => {
        console.error('[competencias/detalhe] falha ao carregar', err)
        setCompetencia(null)
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

  if (!competencia) {
    return (
      <RecordUnavailable
        reason={falha?.reason ?? 'nao_encontrado'}
        notFoundTitle="Competência não encontrada"
        errorTitle="Não foi possível carregar a competência"
        errorDescription={falha?.message}
        backHref="/competencias"
        backLabel="Voltar para competências"
        onRetry={() => setTentativa((n) => n + 1)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/competencias">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {(competencia.clienteNome as string) ?? '—'} —{' '}
                {formatMesAno(competencia.mes as number, competencia.ano as number)}
              </h2>
              <CompetenciaStatusBadge status={competencia.status as string} />
            </div>
            <p className="text-sm text-muted-foreground">
              {(competencia.servicoNome as string) ?? '—'} · Responsável:{' '}
              {(competencia.responsavelNome as string) ?? '—'}
            </p>
          </div>
        </div>
        <Link href={`/competencias/${id}/editar`}>
          <Button variant="outline" size="sm">
            Editar
          </Button>
        </Link>
      </div>

      {competencia.observacoes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {competencia.observacoes as string}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tarefas */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Tarefas Vinculadas</CardTitle>
              <Link
                href={`/tarefas?competenciaId=${id}`}
                className="text-xs text-primary hover:underline"
              >
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {tarefas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma tarefa.</p>
            ) : (
              <ul className="divide-y">
                {tarefas.map((t) => {
                  return (
                    <li key={t.id as string}>
                      <Link
                        href={`/tarefas/${t.id}`}
                        className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">{t.titulo as string}</span>
                        <div className="flex items-center gap-2">
                          <TarefaStatusBadge status={t.status as string} />
                          {t.prioridade ? (
                            <TarefaPrioridadeBadge prioridade={t.prioridade as string} />
                          ) : null}
                        </div>
                        {t.dataPrazo ? (
                          <span className="text-xs text-muted-foreground">
                            Prazo: {formatDate(tsToDate(t.dataPrazo))}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* NFS-e */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-sm font-semibold">NFS-e Emitidas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {nfse.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma NFS-e.</p>
            ) : (
              <ul className="divide-y">
                {nfse.map((n) => (
                  <li key={n.id as string} className="px-4 py-3 flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      Nº {(n.numeroNfse as string) ?? '—'}
                    </span>
                    {n.dataEmissao ? (
                      <span className="text-xs text-muted-foreground">
                        Emissão: {formatDate(tsToDate(n.dataEmissao))}
                      </span>
                    ) : null}
                    <span className="text-xs font-medium">
                      {formatCurrency(n.valorServico as number)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Lançamentos */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Lançamentos</CardTitle>
              <Link
                href={`/financeiro?competenciaId=${id}`}
                className="text-xs text-primary hover:underline"
              >
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {lancamentos.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento.</p>
            ) : (
              <ul className="divide-y">
                {lancamentos.map((l) => {
                  return (
                    <li key={l.id as string} className="px-4 py-3 flex flex-col gap-0.5">
                      <span className="text-sm font-medium truncate">
                        {l.descricao as string}
                      </span>
                      <div className="flex items-center justify-between">
                        {l.dataVencimento ? (
                          <span className="text-xs text-muted-foreground">
                            Venc.: {formatDate(tsToDate(l.dataVencimento))}
                          </span>
                        ) : null}
                        <span className="text-xs font-medium">
                          {formatCurrency(l.valor as number)}
                        </span>
                      </div>
                      <PagamentoStatusBadge status={l.status as string} />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
