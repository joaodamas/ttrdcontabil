'use client'

import { cn } from '@/lib/utils'

type Tone = 'info' | 'warning' | 'danger' | 'success'

const TONE_STYLES: Record<Tone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

export function InlineAlert({
  title,
  description,
  tone = 'info',
  className,
}: {
  title: string
  description?: string
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', TONE_STYLES[tone], className)}>
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="text-xs opacity-90 mt-0.5">{description}</p> : null}
    </div>
  )
}
