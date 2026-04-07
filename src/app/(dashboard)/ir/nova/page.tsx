export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { IrForm } from '@/components/ir/ir-form'

export default async function NovaIrDeclaracaoPage() {
  await requireAuth()

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Nova Declaração IR</h2>
        <p className="text-sm text-muted-foreground">Crie uma nova declaração de Imposto de Renda</p>
      </div>
      <IrForm />
    </div>
  )
}
