export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { CompetenciaForm } from '@/components/competencias/competencia-form'

export default async function EditarCompetenciaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params

  const doc = await adminDb.collection('competencias').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data()!

  const initialData = {
    id: doc.id,
    clienteId: (data.clienteId as string) ?? '',
    clienteServicoId: (data.clienteServicoId as string) ?? '',
    mes: (data.mes as number) ?? 1,
    ano: (data.ano as number) ?? new Date().getFullYear(),
    status:
      (data.status as 'aberta' | 'em_andamento' | 'concluida' | 'cancelada') ?? 'aberta',
    responsavelId: (data.responsavelId as string) ?? undefined,
    observacoes: (data.observacoes as string) ?? undefined,
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Editar Competência</h2>
        <p className="text-sm text-muted-foreground">
          {data.clienteNome as string} — {String(data.mes as number).padStart(2, '0')}/
          {data.ano as number}
        </p>
      </div>
      <CompetenciaForm initialData={initialData} />
    </div>
  )
}
