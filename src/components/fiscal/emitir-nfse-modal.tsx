'use client'

import { FileText, Sparkles } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NfseEmissaoForm } from '@/components/fiscal/nfse-emissao-form'

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!w-[min(1120px,calc(100vw-1.5rem))] !max-w-[min(1120px,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden gap-0 p-0 sm:min-h-[680px]"
      >
        <DialogHeader className="border-b bg-background px-5 py-4 pr-12">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold">Emissão assistida de NFS-e</DialogTitle>
                  <DialogDescription className="mt-1 text-xs sm:text-sm">
                    Revise vínculo, tomador e serviço antes de enviar a nota para a prefeitura.
                  </DialogDescription>
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-medium text-primary sm:flex">
              <Sparkles className="h-3 w-3" />
              Fluxo assistido
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-5">
          <NfseEmissaoForm
            layout="modal"
            initialClienteId={clienteId}
            initialRascunhoId={rascunhoId}
            onCancel={() => onOpenChange(false)}
            onFinished={onFinished}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
