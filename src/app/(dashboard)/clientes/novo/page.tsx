export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { ClienteForm } from '@/components/clientes/cliente-form'

export default async function NovoClientePage() {
  await requireAuth()
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Novo Cliente</h2>
        <p className="text-sm text-muted-foreground">Preencha os dados para cadastrar um novo cliente</p>
      </div>
      <ClienteForm />
    </div>
  )
}
