'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { getPathSegmentAfter } from '@/lib/route-params'
import Link from 'next/link'
import { where, orderBy, limit } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatDate, formatMesAno, formatCurrency , tsToDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { CompetenciaStatusBadge, PagamentoStatusBadge, TarefaPrioridadeBadge, TarefaStatusBadge } from '@/components/ui/status-badge'
import { RecordUnavailable, type RecordLoadFailure } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Pencil } from 'lucide-react'

export default function CompetenciaDetalhePage() {
  const pathname = usePathname()
  const id = useMemo(() => getPathSegmentAfter(pathname, 'competencias'), [pathname])

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
      <PageHeader
        breadcrumbs={[
          { label: 'Competências', href: '/competencias' },
          { label: formatMesAno(competencia.mes as number, competencia.ano as number) },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {(competencia.clienteNome as string) ?? '—'} —{' '}
            {formatMesAno(competencia.mes as number, competencia.ano as number)}
              <CompetenciaStatusBadge status={competencia.status as string} />
          </span>
        }
        description={
          <>
              {(competencia.servicoNome as string) ?? '—'} · Responsável:{' '}
              {(competencia.responsavelNome as string) ?? '—'}
          </>
        }
        action={
          <Link href={`/competencias/${id}/editar`} className={buttonVariants({ variant: 'outline', size: 'cta' })}>
            <Pencil />
            Editar
          </Link>
        }
      />

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
