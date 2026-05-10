import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type WizardStepStatus = 'pending' | 'active' | 'complete' | 'error'

type WizardStep = {
  id: string
  label: string
  description?: string
  status?: WizardStepStatus
}

type WizardStepsProps = {
  steps: WizardStep[]
  className?: string
}

const statusClasses: Record<WizardStepStatus, string> = {
  pending: 'border-border bg-muted/35 text-muted-foreground',
  active: 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/15',
  complete: 'border-success/35 bg-success/10 text-success',
  error: 'border-destructive/35 bg-destructive/10 text-destructive',
}

export function WizardSteps({ steps, className }: WizardStepsProps) {
  return (
    <ol className={cn('grid gap-2 sm:grid-cols-[repeat(var(--steps-count),minmax(0,1fr))]', className)} style={{ '--steps-count': steps.length } as React.CSSProperties}>
      {steps.map((step, index) => {
        const status = step.status ?? 'pending'
        const complete = status === 'complete'

        return (
          <li
            key={step.id}
            className={cn(
              'relative rounded-xl border px-3 py-2.5 transition-colors',
              statusClasses[status]
            )}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-current/25 text-[11px] font-bold">
                {complete ? <CheckCircle2 className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{step.label}</span>
                {step.description && (
                  <span className="mt-0.5 block truncate text-[11px] opacity-75">{step.description}</span>
                )}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export type { WizardStep, WizardStepStatus }
