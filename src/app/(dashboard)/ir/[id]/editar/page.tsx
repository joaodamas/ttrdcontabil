export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { IrForm } from '@/components/ir/ir-form'
import type { Timestamp } from 'firebase-admin/firestore'

export default async function EditarIrDeclaracaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params

  const doc = await adminDb.collection('ir_declaracoes').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data()!
  const dataEntregaTs = data.dataEntrega as Timestamp | undefined

  const initialData = {
    id: doc.id,
    clienteId: (data.clienteId as string) ?? '',
    anoBase: (data.anoBase as number) ?? new Date().getFullYear() - 1,
    status:
      (data.status as 'pendente' | 'em_andamento' | 'entregue' | 'retificado' | 'cancelado') ??
      'pendente',
    responsavelId: (data.responsavelId as string) ?? null,
    dataEntrega: dataEntregaTs ? dataEntregaTs.toDate().toISOString().slice(0, 10) : null,
    numeroRecibo: (data.numeroRecibo as string) ?? null,
    observacoes: (data.observacoes as string) ?? null,
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Editar Declaração IR</h2>
        <p className="text-sm text-muted-foreground">
          {data.clienteNome as string} — {data.anoBase as number}
        </p>
      </div>
      <IrForm initialData={initialData} />
    </div>
  )
}
