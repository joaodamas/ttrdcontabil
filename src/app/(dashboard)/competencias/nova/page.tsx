export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { CompetenciaForm } from '@/components/competencias/competencia-form'

export default async function NovaCompetenciaPage() {
  await requireAuth()
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Nova Competência</h2>
        <p className="text-sm text-muted-foreground">
          Preencha os dados para criar uma nova competência.
        </p>
      </div>
      <CompetenciaForm />
    </div>
  )
}
