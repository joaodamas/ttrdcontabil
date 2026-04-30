'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface FilterBtnProps {
  href?: string
  onClick?: () => void
  active: boolean
  children: React.ReactNode
  className?: string
}

export function FilterBtn({ href, onClick, active, children, className }: FilterBtnProps) {
  const classes = cn(
    'inline-flex items-center h-8 px-3 rounded-lg text-xs font-medium transition-colors border cursor-pointer select-none',
    active
      ? 'bg-foreground text-background border-foreground'
      : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30',
    className
  )

  if (href) {
    return (
    <Link href={href}>
      <span className={classes}>
        {children}
      </span>
    </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  )
}
