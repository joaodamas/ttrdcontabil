'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ChipFiltro = {
  /** Identificador estável (nome do parâmetro na URL). */
  chave: string
  /** "Cliente", "Responsável", "Status"… */
  rotulo: string
  /** Valor legível (nome do cliente, não o id). */
  valor: ReactNode
  /** Endereço sem este filtro (preferido: mantém Voltar coerente)… */
  removerHref?: string
  /** …ou ação, para filtros que não vivem na URL. */
  onRemover?: () => void
}

type FiltrosAtivosProps = {
  chips: Array<ChipFiltro | null | false | undefined | '' | 0>
  /** "Limpar filtros" (aparece com 2+ chips). */
  limparHref?: string
  onLimpar?: () => void
  className?: string
}

const CLASSE_X =
  'inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring'

/**
 * Chips dos filtros em vigor, acima da tabela, cada um removível. Inclui os
 * filtros que chegam pela URL vindos de outra tela (ex.: "Tarefas do
 * cliente") — antes eles filtravam a lista sem aparecer em lugar nenhum.
 */
export function FiltrosAtivos({ chips, limparHref, onLimpar, className }: FiltrosAtivosProps) {
  const ativos = chips.filter((c): c is ChipFiltro => !!c)
  if (ativos.length === 0) return null

  return (
    <div role="group" aria-label="Filtros ativos" className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="mr-0.5 text-xs text-muted-foreground">Filtrando por:</span>
      {ativos.map((c) => {
        const rotuloRemover = `Remover filtro ${c.rotulo}`
        return (
          <span
            key={c.chave}
            data-filtro-ativo={c.chave}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/5 py-0.5 pl-2.5 pr-1 text-xs"
          >
            <span className="text-muted-foreground">{c.rotulo}:</span>
            <span className="max-w-[16rem] truncate font-medium text-foreground">{c.valor}</span>
            {c.removerHref ? (
              <Link href={c.removerHref} aria-label={rotuloRemover} title={rotuloRemover} className={CLASSE_X} scroll={false}>
                <X className="h-3 w-3" />
              </Link>
            ) : c.onRemover ? (
              <button type="button" onClick={c.onRemover} aria-label={rotuloRemover} title={rotuloRemover} className={CLASSE_X}>
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        )
      })}
      {ativos.length > 1 && (limparHref || onLimpar) ? (
        limparHref ? (
          <Link href={limparHref} className="ml-1 text-xs font-medium text-primary hover:underline" scroll={false}>
            Limpar filtros
          </Link>
        ) : (
          <button type="button" onClick={onLimpar} className="ml-1 text-xs font-medium text-primary hover:underline">
            Limpar filtros
          </button>
        )
      ) : null}
    </div>
  )
}
