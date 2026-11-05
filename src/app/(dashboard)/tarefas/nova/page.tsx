'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { TarefaForm } from '@/components/tarefas/tarefa-form'
import { InlineAlert } from '@/components/ui/inline-alert'

// O Cliente 360 linka para /tarefas/nova?clienteId=...; sem ler o parâmetro o
// formulário abria sem o cliente e o usuário tinha de escolher de novo.
function TarefaFormComCliente() {
  const clienteId = useSearchParams().get('clienteId')
  return <TarefaForm initialData={clienteId ? { clienteId } : undefined} />
}

export default function Page() {
  return (
    <div className="stack-6">
      <PageHeader
        title="Nova tarefa"
        breadcrumbs={[{ label: 'Tarefas', href: '/tarefas' }, { label: 'Nova tarefa' }]}
        description="Crie tarefas com prioridade e responsável para melhorar o fluxo diário."
      />
      <InlineAlert
        tone="info"
        title="Boa prática"
        description="Defina prazo e responsável sempre que possível para melhorar a ordenação por SLA no Cockpit."
      />
      <Suspense fallback={<TarefaForm />}>
        <TarefaFormComCliente />
      </Suspense>
    </div>
  )
}
