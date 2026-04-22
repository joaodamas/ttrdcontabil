import { cn } from '@/lib/utils'

interface DetailLayoutProps {
  /** Coluna esquerda — informações principais / KPIs (estreita) */
  sidebar: React.ReactNode
  /** Coluna direita — tabs, tabelas, histórico (larga) */
  main: React.ReactNode
  className?: string
}

/**
 * Layout de 2 colunas para páginas de detalhe.
 * Em mobile empilha verticalmente (sidebar acima do main).
 *
 * @example
 * <DetailLayout
 *   sidebar={<InfoCards />}
 *   main={<Tabs>…</Tabs>}
 * />
 */
export function DetailLayout({ sidebar, main, className }: DetailLayoutProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]', className)}>
      <aside className="space-y-4">{sidebar}</aside>
      <section className="min-w-0">{main}</section>
    </div>
  )
}

/** Card de informação em formato dl/dt/dd para uso na sidebar do DetailLayout. */
export function InfoCard({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Par chave/valor para uso dentro de InfoCard. */
export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-border/60 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}
