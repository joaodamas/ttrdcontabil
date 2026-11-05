'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { getDocument } from '@/lib/firestore-client'
import { TarefaForm } from '@/components/tarefas/tarefa-form'
import { Loader2 } from 'lucide-react'

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<(Record<string, unknown> & { id: string }) | null>(null)

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => {
      void getDocument<Record<string, unknown>>('tarefas', id).then((doc) => {
        if (doc) setData(doc as Record<string, unknown> & { id: string })
      })
    })
  }, [id])

  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }
  return (
    <>
      <PageHeader
        title="Editar tarefa"
        description={typeof data.titulo === 'string' ? data.titulo : undefined}
        breadcrumbs={[
          { label: 'Tarefas', href: '/tarefas' },
          { label: 'Detalhe', href: `/tarefas/${id}` },
          { label: 'Editar' },
        ]}
      />
      <TarefaForm initialData={data} />
    </>
  )
}
