import { cn } from '@/lib/utils'

interface FormSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

/**
 * Seção de formulário com título e grid de campos.
 * Usar para agrupar campos relacionados dentro de um formulário.
 *
 * @example
 * <FormSection title="Dados do responsável" description="Contato principal da empresa.">
 *   <div className="grid grid-cols-2 gap-3">…</div>
 * </FormSection>
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {children}
      </div>
    </div>
  )
}

/** Wrapper para a área de botões de um formulário (submit + cancel). */
export function FormActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 pt-2', className)}>
      {children}
    </div>
  )
}
