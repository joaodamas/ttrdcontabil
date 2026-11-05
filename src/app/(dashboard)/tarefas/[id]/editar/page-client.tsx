'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getDocument } from '@/lib/firestore-client'
import { TarefaForm } from '@/components/tarefas/tarefa-form'
import { RecordUnavailable, type RecordLoadFailure } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { Loader2 } from 'lucide-react'

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<(Record<string, unknown> & { id: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [falha, setFalha] = useState<{ reason: RecordLoadFailure; message?: string } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!id) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setFalha(null)
      getDocument<Record<string, unknown>>('tarefas', id)
        .then((doc) => {
          if (!active) return
          if (doc) {
            setData(doc as Record<string, unknown> & { id: string })
          } else {
            setData(null)
            setFalha({ reason: 'nao_encontrado' })
          }
        })
        .catch((err: unknown) => {
          if (!active) return
          console.error('[tarefas/editar] falha ao carregar', err)
          setData(null)
          setFalha({ reason: 'erro', message: getErrorMessage(err, 'Verifique sua conexão e tente novamente.') })
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    })
    return () => { active = false }
  }, [id, tentativa])

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!data) {
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
  return <TarefaForm initialData={data} />
}
