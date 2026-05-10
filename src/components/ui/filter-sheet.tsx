'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose,
} from '@/components/ui/sheet'

interface FilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset?: () => void
  activeCount?: number
  children: React.ReactNode
}

export function FilterSheet({
  open,
  onOpenChange,
  onReset,
  activeCount = 0,
  children,
}: FilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-safe">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeCount > 0 && (
              <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 py-2 space-y-4">{children}</div>
        <SheetFooter className="flex-row gap-2 px-4">
          {onReset && (
            <SheetClose
              render={
                <Button variant="outline" className="flex-1" onClick={onReset} />
              }
            >
              Limpar filtros
            </SheetClose>
          )}
          <SheetClose
            render={<Button className="flex-1" />}
          >
            Aplicar
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Trigger button for the FilterSheet — only visible on mobile */
export function FilterSheetTrigger({
  onClick,
  activeCount = 0,
}: {
  onClick: () => void
  activeCount?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors sm:hidden"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      Filtros
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  )
}
