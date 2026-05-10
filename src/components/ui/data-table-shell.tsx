'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type DataTableDensity = 'compact' | 'comfortable'

type DataTableShellProps = {
  children: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  density?: DataTableDensity
  storageKey?: string
  className?: string
  contentClassName?: string
}

export function DataTableShell({
  children,
  title,
  description,
  actions,
  density: densityProp,
  storageKey,
  className,
  contentClassName,
}: DataTableShellProps) {
  const [density, setDensity] = React.useState<DataTableDensity>(() => {
    if (!storageKey || typeof window === 'undefined') return densityProp ?? 'compact'
    return (localStorage.getItem(storageKey) as DataTableDensity) ?? densityProp ?? 'compact'
  })

  React.useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, density)
  }, [density, storageKey])

  const activeDensity = storageKey ? density : (densityProp ?? 'compact')

  const hasToolbar = title || description || actions || storageKey

  return (
    <section
      data-slot="data-table-shell"
      data-density={activeDensity}
      className={cn(
        'overflow-hidden rounded-2xl border border-border/65 bg-card/95 text-sm card-shadow',
        className
      )}
    >
      {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-border/70 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && <h3 className="truncate text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {storageKey && (
              <div className="flex items-center rounded-lg border border-border/60 bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  title="Compacto"
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    activeDensity === 'compact'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Compacto
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  title="Confortável"
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    activeDensity === 'comfortable'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Confortável
                </button>
              </div>
            )}
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </div>
      )}
      <div
        className={cn(
          'overflow-x-auto',
          activeDensity === 'compact' && '[&_td]:py-1.5 [&_th]:py-2',
          activeDensity === 'comfortable' && '[&_td]:py-2.5 [&_th]:py-2.5',
          '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10',
          contentClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
