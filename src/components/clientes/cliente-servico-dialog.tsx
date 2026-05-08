'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClienteServicoForm } from '@/components/clientes/cliente-servico-form'
import { getCliente, getServicos } from '@/lib/firestore-client'
import { getErrorMessage } from '@/lib/error-message'
import { toast } from 'sonner'

interface Servico {
  id: string
  nome: string
  codigo?: string | null
  valorPadrao: number | null
}

interface ClienteServicoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteId: string
  onSaved?: () => void
}

export function ClienteServicoDialog({
  open,
  onOpenChange,
  clienteId,
  onSaved,
}: ClienteServicoDialogProps) {
  const [servicos, setServicos] = useState<Servico[]>([])
  const [clienteNome, setClienteNome] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !clienteId) return
    queueMicrotask(() => {
      setLoading(true)
      setError(null)
      Promise.all([getServicos(), getCliente(clienteId).catch(() => null)])
        .then(([data, cliente]) => {
          setServicos(
            data.map((s) => ({
              id: s.id,
              nome: (s as Record<string, unknown>).nome as string,
              codigo: ((s as Record<string, unknown>).codigo as string | undefined) ?? null,
              valorPadrao: ((s as Record<string, unknown>).valorPadrao as number) ?? null,
            }))
          )
          setClienteNome(((cliente as Record<string, unknown> | null)?.razaoSocial as string | undefined) ?? undefined)
        })
        .catch((err) => {
          const message = getErrorMessage(err, 'Não foi possível carregar os serviços disponíveis.')
          setError(message)
          toast.error(message)
        })
        .finally(() => setLoading(false))
    })
  }, [open, clienteId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular serviço ao cliente</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <ClienteServicoForm
            clienteId={clienteId}
            clienteNome={clienteNome}
            servicos={servicos}
            mode="modal"
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false)
              onSaved?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
