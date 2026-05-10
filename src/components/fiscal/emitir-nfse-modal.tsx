'use client'

import { useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'

import { AppModal } from '@/components/ui/app-modal'
import { WizardSteps } from '@/components/ui/wizard-step'
import { NfseEmissaoForm } from '@/components/fiscal/nfse-emissao-form'

type StepStatus = 'pending' | 'active' | 'complete'

const STEPS = [
  { id: 'vinculo',  label: 'Vínculo',   description: 'cliente e competência' },
  { id: 'tomador',  label: 'Tomador',   description: 'dados fiscais'          },
  { id: 'servico',  label: 'Serviço',   description: 'descrição e valores'    },
  { id: 'validacao',label: 'Validação', description: 'regras fiscais'         },
  { id: 'resumo',   label: 'Resumo',    description: 'emissão final'          },
]

function buildStepStatuses(activeIdx: number): StepStatus[] {
  return STEPS.map((_, i) => {
    if (i < activeIdx) return 'complete'
    if (i === activeIdx) return 'active'
    return 'pending'
  })
}

interface EmitirNfseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteId?: string
  rascunhoId?: string
  onFinished?: () => void | Promise<void>
}

export function EmitirNfseModal({
  open,
  onOpenChange,
  clienteId,
  rascunhoId,
  onFinished,
}: EmitirNfseModalProps) {
  const [activeStep, setActiveStep] = useState(0)
  const statuses = buildStepStatuses(activeStep)

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Emissão assistida de NFS-e"
      description="Revise vínculo, tomador e serviço antes de enviar a nota para a prefeitura."
      icon={<FileText className="size-4" />}
      badge={(
        <span className="hidden items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-medium text-primary sm:inline-flex">
          <Sparkles className="h-3 w-3" />
          Fluxo assistido
        </span>
      )}
      size="wide"
      contentClassName="sm:min-h-[680px]"
    >
      <div className="space-y-5">
        <WizardSteps
          steps={STEPS.map((s, i) => ({ ...s, status: statuses[i] }))}
        />
        <NfseEmissaoForm
          layout="modal"
          initialClienteId={clienteId}
          initialRascunhoId={rascunhoId}
          onCancel={() => onOpenChange(false)}
          onFinished={onFinished}
          onStepChange={setActiveStep}
        />
      </div>
    </AppModal>
  )
}
