'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { getPathSegmentAfter } from '@/lib/route-params'
import Link from 'next/link'
import { where, orderBy, Timestamp } from 'firebase/firestore'

import { getDocument, listDocuments, updateDocument } from '@/lib/firestore-client'
import { formatDate , tsToDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { IrStatusBadge } from '@/components/ui/status-badge'
import { RecordUnavailable, type RecordLoadFailure } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Pencil, Loader2 } from 'lucide-react'

export default function IrDetalhePage() {
  const pathname = usePathname()
  const id = useMemo(() => getPathSegmentAfter(pathname, 'ir'), [pathname])

  const [declaracao, setDeclaracao] = useState<Record<string, unknown> | null>(null)
  const [checklist, setChecklist] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [falha, setFalha] = useState<{ reason: RecordLoadFailure; message?: string } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => {
      setLoading(true)
      setFalha(null)
      Promise.all([
        getDocument('ir_declaracoes', id),
        listDocuments('ir_checklist', [
          where('declaracaoId', '==', id),
          orderBy('criadoEm', 'asc'),
        ]),
      ]).then(([declaracaoData, checklistData]) => {
        if (!declaracaoData) {
          setDeclaracao(null)
          setFalha({ reason: 'nao_encontrado' })
          return
        }
        setDeclaracao(declaracaoData as Record<string, unknown>)
        setChecklist(checklistData as Array<Record<string, unknown>>)
      }).catch((err: unknown) => {
        console.error('[ir/detalhe] falha ao carregar', err)
        setDeclaracao(null)
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

  if (!declaracao) {
    return (
      <RecordUnavailable
        reason={falha?.reason ?? 'nao_encontrado'}
        notFoundTitle="Declaração não encontrada"
        errorTitle="Não foi possível carregar a declaração"
        errorDescription={falha?.message}
        backHref="/ir"
        backLabel="Voltar para IR"
        onRetry={() => setTentativa((n) => n + 1)}
      />
    )
  }

  const dataEntrega = declaracao.dataEntrega as Timestamp | undefined
  const criadoEm = declaracao.criadoEm as Timestamp | undefined
  const recebidos = checklist.filter((item) => item.recebido).length

  async function toggleChecklistItem(itemId: string, checked: boolean) {
    await updateDocument('ir_checklist', itemId, {
      recebido: checked,
      dataRecebimento: checked ? Timestamp.now() : null,
    })
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, recebido: checked, dataRecebimento: checked ? Timestamp.now() : null }
          : item
      )
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Imposto de Renda', href: '/ir' }, { label: `IR ${declaracao.anoBase as number}` }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {(declaracao.clienteNome as string) ?? '—'} — IR {declaracao.anoBase as number}
              <IrStatusBadge status={declaracao.status as string} />
          </span>
        }
        description={
          <>
              Responsável: {(declaracao.responsavelNome as string) ?? '—'}
              {dataEntrega && ` · Entrega: ${formatDate(tsToDate(dataEntrega))}`}
          </>
        }
        action={
          <Link href={`/ir/${id}/editar`} className={buttonVariants({ variant: 'outline', size: 'cta' })}>
            <Pencil />
            Editar
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Checklist de Documentos</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {recebidos}/{checklist.length} recebidos
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {checklist.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Nenhum documento cadastrado.
                </p>
              ) : (
                <ul className="divide-y">
                  {checklist.map((item) => {
                    const dataRecebimento = item.dataRecebimento as Timestamp | undefined
                    return (
                      <li key={item.id as string} className="flex items-center gap-3 px-4 py-3">
                        <Checkbox
                          id={`item-${item.id}`}
                          checked={Boolean(item.recebido)}
                          onCheckedChange={(checked) =>
                            void toggleChecklistItem(item.id as string, Boolean(checked))
                          }
                        />
                        <label
                          htmlFor={`item-${item.id}`}
                          className={`flex-1 text-sm ${
                            item.recebido ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {item.descricao as string}
                        </label>
                        {item.recebido && dataRecebimento ? (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(tsToDate(dataRecebimento))}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Cliente</p>
                {declaracao.clienteId ? (
                  <Link
                    href={`/clientes/${declaracao.clienteId}`}
                    className="font-medium hover:underline"
                  >
                    {(declaracao.clienteNome as string) ?? '—'}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ano-base</p>
                <p className="font-medium">{declaracao.anoBase as number}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <IrStatusBadge status={declaracao.status as string} />
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Responsável</p>
                <p className="font-medium">{(declaracao.responsavelNome as string) ?? '—'}</p>
              </div>

              {dataEntrega ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Data de Entrega
                  </p>
                  <p className="font-medium">{formatDate(tsToDate(dataEntrega))}</p>
                </div>
              ) : null}

              {declaracao.numeroRecibo ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Nº Recibo
                  </p>
                  <p className="font-medium">{declaracao.numeroRecibo as string}</p>
                </div>
              ) : null}

              {declaracao.observacoes ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Observações
                  </p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {declaracao.observacoes as string}
                  </p>
                </div>
              ) : null}

              {criadoEm ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Criada em</p>
                  <p className="text-muted-foreground">{formatDate(tsToDate(criadoEm))}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
