'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: Breadcrumb[]
  action?: React.ReactNode
  className?: string
}

/**
 * Cabeçalho padrão de página com título, descrição opcional, breadcrumbs e slot de ação (CTA).
 * Usar em todas as páginas de listagem, detalhe e formulário — é o único `<h1>` da página.
 *
 * Em telas estreitas título/descrição ficam acima das ações; as ações quebram
 * linha (`flex-wrap`) em vez de vazar horizontalmente.
 * Páginas de detalhe/edição usam `breadcrumbs` como padrão único de "voltar".
 * Ações primárias usam `buttonVariants({ size: 'cta' })`; secundárias, `variant: 'outline'` no mesmo tamanho.
 */
export function PageHeader({ title, description, breadcrumbs, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'surface-subtle mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border px-4 py-4 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-64">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-1.5 flex flex-wrap items-center gap-1" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" aria-hidden />}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate text-xs text-muted-foreground" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* Title */}
        <h1 className="break-words text-xl font-semibold leading-tight text-foreground">{title}</h1>

        {/* Description */}
        {description && (
          <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>
        )}
      </div>

      {/* Action slot */}
      {action && (
        <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
