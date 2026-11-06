'use client'

import { AlertTriangle, ShieldOff } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import type { FalhaSecao } from './use-ficha-cliente'

export const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento / Imune',
}

export const rotuloRegime = (v: unknown) => (v ? REGIME_LABELS[String(v)] ?? String(v) : '—')

/** Cartão de seção da ficha (mesmo visual em todas as abas). */
export const CARD_FICHA = 'border-border/70 shadow-none'
export const CARD_FICHA_HEADER = 'flex flex-row flex-wrap items-center justify-between gap-2 px-4 py-3'
export const CARD_FICHA_CONTENT = 'px-4 pb-4'

/**
 * Seção que não carregou: "Sem acesso a este módulo" quando as regras negaram
 * (perfil), "Não foi possível carregar" com retry quando a leitura falhou —
 * nunca uma lista vazia que pareça "nenhum registro".
 */
export function SecaoIndisponivel({ falha, onRetry, descricaoErro }: { falha: FalhaSecao; onRetry: () => void; descricaoErro?: string }) {
  if (falha === 'negado') {
    return (
      <EmptyState
        size="sm"
        icon={ShieldOff}
        title="Sem acesso a este módulo"
        description="Seu perfil não permite ver estas informações. Se precisar, fale com o administrador."
      />
    )
  }
  return (
    <EmptyState
      size="sm"
      icon={AlertTriangle}
      title="Não foi possível carregar"
      description={descricaoErro ?? 'A lista não foi lida — não quer dizer que esteja vazia.'}
      action={{ label: 'Tentar novamente', onClick: onRetry }}
    />
  )
}

/** Contador da aba com largura reservada (o rótulo não "anda" ao carregar). */
export function ContadorAba({ n }: { n?: number }) {
  const tem = typeof n === 'number' && n > 0
  return (
    <span aria-hidden className={`min-w-[3ch] text-left text-[10px] leading-none tabular-nums opacity-60 ${tem ? '' : 'invisible'}`}>
      {tem ? n : 0}
    </span>
  )
}

/** Esqueleto do conteúdo de uma aba (mesma estrutura de cartões). */
export function EsqueletoAba() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      <div className="rounded-xl border border-border/70 p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border/70 p-4 space-y-2">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </div>
  )
}
