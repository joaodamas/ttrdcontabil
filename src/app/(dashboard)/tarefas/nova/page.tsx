'use client'
import { TarefaForm } from '@/components/tarefas/tarefa-form'
import { InlineAlert } from '@/components/ui/inline-alert'

export default function Page() {
  return (
    <div className="stack-6">
      <div>
        <h1 className="text-title">Nova Tarefa</h1>
        <p className="text-subtle">Crie tarefas com prioridade e responsável para melhorar o fluxo diário.</p>
      </div>
      <InlineAlert
        tone="info"
        title="Boa prática"
        description="Defina prazo e responsável sempre que possível para melhorar a ordenação por SLA no Cockpit."
      />
      <TarefaForm />
    </div>
  )
}
