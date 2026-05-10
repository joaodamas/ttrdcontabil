import { type LucideIcon } from 'lucide-react'
import { Button } from './button'
import Link from 'next/link'

type EmptyStateAction = {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  size?: 'sm' | 'md' | 'lg'
}

function ActionButton({ action }: { action: EmptyStateAction }) {
  const btn = (
    <Button size="sm" variant={action.variant ?? 'default'} onClick={action.onClick}>
      {action.label}
    </Button>
  )
  return action.href ? <Link href={action.href}>{btn}</Link> : btn
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
}: EmptyStateProps) {
  const pyClass = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-20' : 'py-14'
  return (
    <div className={`flex flex-col items-center justify-center ${pyClass} px-4 text-center`}>
      {Icon && (
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted mb-4">
          <Icon className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-xs leading-relaxed">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton action={action} />}
          {secondaryAction && <ActionButton action={{ variant: 'outline', ...secondaryAction }} />}
        </div>
      )}
    </div>
  )
}

export function TableEmptyState({
  colSpan,
  title,
  description,
  action,
  secondaryAction,
  icon,
  size,
}: EmptyStateProps & { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState title={title} description={description} action={action} secondaryAction={secondaryAction} icon={icon} size={size} />
      </td>
    </tr>
  )
}
