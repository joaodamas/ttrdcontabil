'use client'

import { useState } from 'react'
import { Info, AlertTriangle, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InlineAlertTone = 'info' | 'warning' | 'danger' | 'success'

const TONE_STYLES: Record<InlineAlertTone, string> = {
  info:    'border-blue-200   bg-blue-50   text-blue-900   dark:border-blue-800   dark:bg-blue-950/40   dark:text-blue-200',
  warning: 'border-amber-200  bg-amber-50  text-amber-900  dark:border-amber-800  dark:bg-amber-950/40  dark:text-amber-200',
  danger:  'border-red-200    bg-red-50    text-red-900    dark:border-red-800    dark:bg-red-950/40    dark:text-red-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
}

const TONE_ICON: Record<InlineAlertTone, React.ReactNode> = {
  info:    <Info className="h-4 w-4 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
  danger:  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />,
}

interface InlineAlertProps {
  title: string
  description?: string
  tone?: InlineAlertTone
  className?: string
  dismissible?: boolean
  action?: { label: string; onClick: () => void }
}

export function InlineAlert({
  title,
  description,
  tone = 'info',
  className,
  dismissible = false,
  action,
}: InlineAlertProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-xl border px-3 py-2.5', TONE_STYLES[tone], className)}
    >
      {TONE_ICON[tone]}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {description && <p className="text-xs opacity-80 leading-relaxed">{description}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-1 text-xs font-semibold underline underline-offset-2 hover:no-underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          aria-label="Fechar alerta"
          onClick={() => setDismissed(true)}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
