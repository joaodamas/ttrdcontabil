export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { ClienteServicoForm } from '@/components/clientes/cliente-servico-form'

export default async function NovoClienteServicoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params

  const clienteDoc = await adminDb.collection('clientes').doc(id).get()
  if (!clienteDoc.exists) notFound()

  const servicosSnap = await adminDb
    .collection('servicos')
    .where('ativo', '==', true)
    .orderBy('nome')
    .get()

  const servicos = servicosSnap.docs.map((d) => ({ id: d.id, nome: d.data().nome as string, valorPadrao: d.data().valorPadrao ?? null }))

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Adicionar Serviço</h2>
        <p className="text-sm text-muted-foreground">
          {clienteDoc.data()!.razaoSocial as string}
        </p>
      </div>
      <ClienteServicoForm clienteId={id} servicos={servicos} />
    </div>
  )
}
