export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { ClienteForm } from '@/components/clientes/cliente-form'

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params

  const doc = await adminDb.collection('clientes').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data()!
  const initialData = {
    id: doc.id,
    tipoPessoa: data.tipoPessoa ?? 'pj',
    razaoSocial: data.razaoSocial ?? '',
    nomeFantasia: data.nomeFantasia ?? '',
    cpfCnpj: data.cpfCnpj ?? '',
    email: data.email ?? '',
    telefone: data.telefone ?? '',
    celular: data.celular ?? '',
    cep: data.cep ?? '',
    logradouro: data.logradouro ?? '',
    numero: data.numero ?? '',
    complemento: data.complemento ?? '',
    bairro: data.bairro ?? '',
    cidade: data.cidade ?? '',
    uf: data.uf ?? '',
    regimeTributario: data.regimeTributario ?? null,
    status: data.status ?? 'ativo',
    observacoes: data.observacoes ?? '',
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Editar Cliente</h2>
        <p className="text-sm text-muted-foreground">{data.razaoSocial as string}</p>
      </div>
      <ClienteForm initialData={initialData} />
    </div>
  )
}
