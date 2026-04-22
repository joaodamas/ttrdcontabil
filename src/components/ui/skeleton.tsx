import { cn } from '@/lib/utils'

/** Bloco genérico de skeleton (substitui qualquer conteúdo ainda carregando). */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

/** Skeleton de linha de tabela — N colunas com proporções configuráveis. */
export function TableRowSkeleton({
  cols = 5,
  rows = 8,
}: {
  cols?: number
  rows?: number
}) {
  const widths = ['w-2/5', 'w-1/5', 'w-1/6', 'w-1/6', 'w-12']

  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className={cn('h-4', widths[j] ?? 'w-1/4')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Skeleton para card de KPI (número + label). */
export function KpiCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
    </div>
  )
}

/** Skeleton para listagem com várias rows (div, não table). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-lg border bg-card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 w-1/6 hidden md:block" />
          <Skeleton className="h-5 w-14 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  )
}
