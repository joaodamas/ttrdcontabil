'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn, formatMesAno } from '@/lib/utils'
import { deslocarMes } from '@/lib/url-filtros'

type SeletorMesProps = {
  /** null = sem filtro de mês ("Todos os meses"). */
  mes: number | null
  ano: number | null
  hrefPara: (mes: number, ano: number) => string
  /** Endereço sem filtro de mês; sem ele, a opção "Todos os meses" não aparece. */
  hrefTodos?: string
  className?: string
}

const CLASSE_SETA = buttonVariants({ variant: 'outline', size: 'sm', className: 'h-9 w-9 rounded-xl p-0' })

/** ‹ Mês/Ano › com links (mesmo padrão em Competências e no Histórico de NFS-e). */
export function SeletorMes({ mes, ano, hrefPara, hrefTodos, className }: SeletorMesProps) {
  if (mes == null || ano == null) {
    const hoje = new Date()
    return (
      <div className={cn('flex items-center gap-2', className)} data-seletor-mes="">
        <span className="px-1 text-sm font-medium">Todos os meses</span>
        <Link
          href={hrefPara(hoje.getMonth() + 1, hoje.getFullYear())}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-9 rounded-xl' })}
        >
          Filtrar por mês
        </Link>
      </div>
    )
  }

  const anterior = deslocarMes(mes, ano, -1)
  const seguinte = deslocarMes(mes, ano, 1)
  return (
    <div className={cn('flex items-center gap-1', className)} data-seletor-mes="">
      <Link href={hrefPara(anterior.mes, anterior.ano)} aria-label="Mês anterior" title="Mês anterior" className={CLASSE_SETA}>
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-[5.5rem] px-2 text-center text-sm font-medium" aria-live="polite">{formatMesAno(mes, ano)}</span>
      <Link href={hrefPara(seguinte.mes, seguinte.ano)} aria-label="Próximo mês" title="Próximo mês" className={CLASSE_SETA}>
        <ChevronRight className="h-4 w-4" />
      </Link>
      {hrefTodos ? (
        <Link href={hrefTodos} className="ml-1 whitespace-nowrap text-xs font-medium text-primary hover:underline">
          Todos os meses
        </Link>
      ) : null}
    </div>
  )
}
