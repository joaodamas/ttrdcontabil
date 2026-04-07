export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { LancamentoForm } from '@/components/financeiro/lancamento-form'

export default async function NovoLancamentoPage() {
  await requireAuth()

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Novo Lançamento</h2>
        <p className="text-sm text-muted-foreground">Registre uma receita ou despesa</p>
      </div>
      <LancamentoForm />
    </div>
  )
}
