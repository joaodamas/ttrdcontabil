'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: Breadcrumb[]
  action?: React.ReactNode
  className?: string
}

/**
 * Cabeçalho padrão de página com título, descrição opcional, breadcrumbs e slot de ação (CTA).
 * Usar em todas as páginas de listagem, detalhe e formulário.
 */
export function PageHeader({ title, description, breadcrumbs, action, className }: PageHeaderProps) {
  return (
    <div className={cn('surface-subtle mb-6 flex items-start justify-between gap-4 border px-4 py-4 sm:px-5', className)}>
      <div className="min-w-0">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-1.5 flex items-center gap-1" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* Title */}
        <h1 className="truncate text-xl font-semibold leading-tight text-foreground">{title}</h1>

        {/* Description */}
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Action slot */}
      {action && (
        <div className="mt-0.5 flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  )
}
