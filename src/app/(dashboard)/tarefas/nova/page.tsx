export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { TarefaForm } from '@/components/tarefas/tarefa-form'

export default async function NovaTarefaPage() {
  await requireAuth()

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Nova Tarefa</h2>
        <p className="text-sm text-muted-foreground">Crie uma nova tarefa e atribua um responsável</p>
      </div>
      <TarefaForm />
    </div>
  )
}
