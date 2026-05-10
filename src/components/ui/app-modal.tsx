'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AppModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'fullscreen'

type AppModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  summary?: React.ReactNode
  size?: AppModalSize
  showCloseButton?: boolean
  contentClassName?: string
  bodyClassName?: string
  headerClassName?: string
  footerClassName?: string
  summaryClassName?: string
}

const sizeClasses: Record<AppModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  wide: '!w-[min(1120px,calc(100vw-1.5rem))] !max-w-[min(1120px,calc(100vw-1.5rem))]',
  fullscreen: '!w-[calc(100vw-1.5rem)] !max-w-[calc(100vw-1.5rem)] sm:!w-[calc(100vw-3rem)] sm:!max-w-[calc(100vw-3rem)]',
}

export function AppModal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  badge,
  children,
  footer,
  summary,
  size = 'md',
  showCloseButton = true,
  contentClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
  summaryClassName,
}: AppModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'grid max-h-[calc(100dvh-1.5rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0',
          sizeClasses[size],
          footer && 'grid-rows-[auto_minmax(0,1fr)_auto]',
          contentClassName
        )}
      >
        <div
          className={cn(
            'flex min-h-16 items-start gap-3 border-b border-border/70 bg-popover px-5 py-4',
            headerClassName
          )}
        >
          {icon && (
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/60 text-foreground">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <DialogTitle className="text-base leading-snug">{title}</DialogTitle>
              {badge}
            </div>
            {description && (
              <DialogDescription className="text-xs leading-relaxed">
                {description}
              </DialogDescription>
            )}
          </div>
          {showCloseButton && (
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-3 top-3"
                  aria-label="Fechar modal"
                />
              }
            >
              <X />
            </DialogClose>
          )}
        </div>

        <div
          className={cn(
            'grid min-h-0 overflow-hidden',
            summary && 'lg:grid-cols-[minmax(0,1fr)_280px]',
          )}
        >
          <div className={cn('min-h-0 overflow-y-auto px-5 py-5', bodyClassName)}>
            {children}
          </div>
          {summary && (
            <aside
              className={cn(
                'min-h-0 border-t border-border/70 bg-muted/35 px-5 py-5 lg:border-l lg:border-t-0',
                summaryClassName
              )}
            >
              {summary}
            </aside>
          )}
        </div>

        {footer && (
          <div
            className={cn(
              'flex flex-col-reverse gap-2 border-t border-border/70 bg-muted/45 px-5 py-4 sm:flex-row sm:justify-end',
              footerClassName
            )}
          >
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

