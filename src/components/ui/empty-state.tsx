import { type LucideIcon } from 'lucide-react'
import { Button } from './button'
import Link from 'next/link'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Se informado, renderiza um botão CTA */
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
}

/**
 * Estado vazio padronizado para tabelas e listagens.
 * Usar quando a query retorna 0 resultados.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      {Icon && (
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted mb-4">
          <Icon className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link href={action.href}>
              <Button size="sm">{action.label}</Button>
            </Link>
          ) : (
            <Button size="sm" onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Versão inline para uso dentro de células de tabela (colSpan). */
export function TableEmptyState({
  colSpan,
  title,
  description,
  action,
  icon,
}: EmptyStateProps & { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState title={title} description={description} action={action} icon={icon} />
      </td>
    </tr>
  )
}
