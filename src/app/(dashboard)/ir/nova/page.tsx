'use client'
import { PageHeader } from '@/components/layout/page-header'
import { IrForm } from '@/components/ir/ir-form'
import { InlineAlert } from '@/components/ui/inline-alert'

export default function Page() {
  return (
    <div className="stack-6">
      <PageHeader
        title="Nova declaração"
        breadcrumbs={[{ label: 'Imposto de Renda', href: '/ir' }, { label: 'Nova declaração' }]}
        description="Registre o ciclo da declaração com status e responsável desde o início."
      />
      <InlineAlert
        tone="warning"
        title="Atenção a prazos"
        description="Priorize declarações pendentes para reduzir risco de atraso fiscal."
      />
      <IrForm />
    </div>
  )
}
