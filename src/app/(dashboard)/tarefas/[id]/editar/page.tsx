export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { TarefaForm } from '@/components/tarefas/tarefa-form'
import type { Timestamp } from 'firebase-admin/firestore'

export default async function EditarTarefaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params

  const doc = await adminDb.collection('tarefas').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data()!

  const dataPrazoTs = data.dataPrazo as Timestamp | undefined

  const initialData = {
    id: doc.id,
    clienteId: (data.clienteId as string) ?? null,
    competenciaId: (data.competenciaId as string) ?? null,
    titulo: (data.titulo as string) ?? '',
    descricao: (data.descricao as string) ?? null,
    prioridade: (data.prioridade as 'baixa' | 'normal' | 'alta' | 'urgente') ?? 'normal',
    status: (data.status as 'pendente' | 'em_andamento' | 'concluida' | 'cancelada') ?? 'pendente',
    responsavelId: (data.responsavelId as string) ?? null,
    dataPrazo: dataPrazoTs ? dataPrazoTs.toDate().toISOString().slice(0, 10) : null,
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Editar Tarefa</h2>
        <p className="text-sm text-muted-foreground">{data.titulo as string}</p>
      </div>
      <TarefaForm initialData={initialData} />
    </div>
  )
}
