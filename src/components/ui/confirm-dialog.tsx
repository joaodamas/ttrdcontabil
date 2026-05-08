'use client'

import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: string
  description?: ReactNode
  /** Texto do botão de confirmação. Padrão: "Confirmar" */
  confirmLabel?: string
  /** Texto do botão de cancelamento. Padrão: "Cancelar" */
  cancelLabel?: string
  /** Se true, o botão de confirmação fica vermelho (ação destrutiva). */
  destructive?: boolean
  /** Função executada ao confirmar. Pode ser async. */
  onConfirm: () => void | Promise<void>
}

/**
 * Dialog de confirmação reutilizável para ações potencialmente destrutivas.
 *
 * @example
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Excluir cliente?"
 *   description="Esta ação não pode ser desfeita."
 *   confirmLabel="Excluir"
 *   destructive
 *   onConfirm={handleDelete}
 * />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Tem certeza?',
  description = 'Esta ação não pode ser desfeita.',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm() }}
            disabled={loading}
            className={destructive
              ? 'bg-destructive text-white hover:bg-destructive/90'
              : undefined}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
