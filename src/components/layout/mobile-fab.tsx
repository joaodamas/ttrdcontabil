'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, CheckSquare, DollarSign, FileText, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

type FabAction = {
  label: string
  href: string
  icon: React.ReactNode
  colorClass: string
}

const FAB_ACTIONS: FabAction[] = [
  { label: 'Nova tarefa',       href: '/tarefas/nova',         icon: <CheckSquare className="h-4 w-4" />, colorClass: 'bg-primary text-primary-foreground' },
  { label: 'Novo cliente',      href: '/clientes/novo',        icon: <Users className="h-4 w-4" />,       colorClass: 'bg-secondary text-secondary-foreground' },
  { label: 'Novo lançamento',   href: '/financeiro?novo=1',    icon: <DollarSign className="h-4 w-4" />, colorClass: 'bg-success text-success-foreground' },
  { label: 'Emitir NFS-e',      href: '/fiscal?emitir=1',      icon: <FileText className="h-4 w-4" />,   colorClass: 'bg-warning text-warning-foreground' },
]

export function MobileFab() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  function handleAction(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col items-end gap-3 sm:hidden">
      {/* Action buttons — visible when open */}
      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          {/* Action items */}
          <div className="relative z-10 flex flex-col items-end gap-2">
            {FAB_ACTIONS.map((action) => (
              <button
                key={action.href}
                type="button"
                onClick={() => handleAction(action.href)}
                className="flex items-center gap-2.5 rounded-full shadow-lg pl-3 pr-4 py-2.5 text-sm font-medium transition-transform active:scale-95"
                style={{ animation: 'fadeSlideUp 0.15s ease-out' }}
              >
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-full shrink-0 shadow', action.colorClass)}>
                  {action.icon}
                </span>
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs shadow">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Main FAB button */}
      <button
        type="button"
        aria-label={open ? 'Fechar ações rápidas' : 'Abrir ações rápidas'}
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'relative z-10 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all active:scale-95',
          open
            ? 'bg-destructive text-destructive-foreground rotate-45'
            : 'bg-foreground text-background'
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  )
}
