'use client'
import { IrForm } from '@/components/ir/ir-form'
import { InlineAlert } from '@/components/ui/inline-alert'

export default function Page() {
  return (
    <div className="stack-6">
      <div>
        <h1 className="text-title">Nova Declaração de IR</h1>
        <p className="text-subtle">Registre o ciclo da declaração com status e responsável desde o início.</p>
      </div>
      <InlineAlert
        tone="warning"
        title="Atenção a prazos"
        description="Priorize declarações pendentes para reduzir risco de atraso fiscal."
      />
      <IrForm />
    </div>
  )
}
