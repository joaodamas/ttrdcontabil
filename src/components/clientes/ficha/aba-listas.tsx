'use client'

import { ArrowRight, Briefcase, CalendarDays, DollarSign, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { CompetenciaStatusBadge, PagamentoStatusBadge } from '@/components/ui/status-badge'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { formatCurrency, formatDate, formatMesAno, tsToDate } from '@/lib/utils'
import { CARD_FICHA, CARD_FICHA_CONTENT, CARD_FICHA_HEADER, SecaoIndisponivel } from './ficha-comum'
import type { FalhaSecao, Registro } from './use-ficha-cliente'

export function valorMensalAtivo(servicos: Registro[]) {
  return servicos.filter((s) => s.status === 'ativo').reduce((acc, s) => acc + (Number(s.valor) || 0), 0)
}

export function AbaServicos({ servicos, falha, podeEditar, onVincular, onRecarregar }: {
  servicos: Registro[]; falha?: FalhaSecao; podeEditar: boolean; onVincular: () => void; onRecarregar: () => void
}) {
  const total = valorMensalAtivo(servicos)
  return (
    <Card className={CARD_FICHA}>
      <CardHeader className={CARD_FICHA_HEADER}>
        <CardTitle className="text-sm">Serviços vinculados</CardTitle>
        {podeEditar && !falha ? (
          <Button size="sm" className="h-8" onClick={onVincular}><Plus className="h-3.5 w-3.5" />Serviço</Button>
        ) : null}
      </CardHeader>
      <CardContent className={CARD_FICHA_CONTENT}>
        {falha ? (
          <SecaoIndisponivel falha={falha} onRetry={onRecarregar} descricaoErro="Não dá para afirmar que o cliente está sem serviço contratado." />
        ) : servicos.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Briefcase}
            title="Nenhum serviço vinculado"
            description={podeEditar ? 'Vincule um serviço para gerar competências e honorários.' : 'Este cliente ainda não tem serviços vinculados.'}
            {...(podeEditar ? { action: { label: 'Vincular serviço', onClick: onVincular } } : {})}
          />
        ) : (
          <>
            <div className="divide-y">
              {servicos.map((s) => (
                <div key={s.id as string} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.servicoNome as string}</p>
                    <p className="text-xs text-muted-foreground">{s.dataInicio ? `Desde ${formatDate(tsToDate(s.dataInicio))}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(Number(s.valor) || 0)}</span>
                    <Badge variant={s.status === 'ativo' ? 'success' : 'secondary'}>{s.status === 'ativo' ? 'Ativo' : String(s.status ?? '—')}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total mensal (ativos)</span>
              <span className="font-bold tabular-nums text-primary">{formatCurrency(total)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AbaCompetencias({ clienteId, competencias, falha, onRecarregar }: {
  clienteId: string; competencias: Registro[]; falha?: FalhaSecao; onRecarregar: () => void
}) {
  return (
    <Card className={CARD_FICHA}>
      <CardHeader className={CARD_FICHA_HEADER}>
        <CardTitle className="text-sm">Competências recentes</CardTitle>
        <div className="flex items-center gap-2">
          <LinkPermitido semAcesso="ocultar" href={`/competencias?clienteId=${clienteId}`} className={buttonVariants({ size: 'sm', variant: 'ghost', className: 'h-8' })}>
            Ver todas<ArrowRight className="h-3.5 w-3.5" />
          </LinkPermitido>
          <LinkPermitido semAcesso="ocultar" href={`/competencias/nova?clienteId=${clienteId}`} className={buttonVariants({ size: 'sm', className: 'h-8' })}>
            <Plus className="h-3.5 w-3.5" />Nova
          </LinkPermitido>
        </div>
      </CardHeader>
      <CardContent className={CARD_FICHA_CONTENT}>
        {falha ? (
          <SecaoIndisponivel falha={falha} onRetry={onRecarregar} />
        ) : competencias.length === 0 ? (
          <EmptyState size="sm" icon={CalendarDays} title="Nenhuma competência" description="Competências são criadas a cada mês para serviços ativos." />
        ) : (
          <div className="divide-y">
            {competencias.map((c) => (
              <LinkPermitido
                key={c.id as string}
                href={`/competencias/${c.id as string}`}
                className="-mx-2 flex items-center justify-between rounded px-2 py-2.5 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatMesAno(c.mes as number, c.ano as number)}</p>
                  {c.servicoNome ? <p className="truncate text-xs text-muted-foreground">{c.servicoNome as string}</p> : null}
                </div>
                <CompetenciaStatusBadge status={c.status as string} />
              </LinkPermitido>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function AbaFinanceiro({ clienteId, lancamentos, falha, onRecarregar }: {
  clienteId: string; lancamentos: Registro[]; falha?: FalhaSecao; onRecarregar: () => void
}) {
  return (
    <Card className={CARD_FICHA}>
      <CardHeader className={CARD_FICHA_HEADER}>
        <CardTitle className="text-sm">Lançamentos recentes</CardTitle>
        <LinkPermitido semAcesso="ocultar" href={`/financeiro?clienteId=${clienteId}`} className={buttonVariants({ size: 'sm', variant: 'ghost', className: 'h-8' })}>
          Ver todos<ArrowRight className="h-3.5 w-3.5" />
        </LinkPermitido>
      </CardHeader>
      <CardContent className={CARD_FICHA_CONTENT}>
        {falha ? (
          <SecaoIndisponivel falha={falha} onRetry={onRecarregar} />
        ) : lancamentos.length === 0 ? (
          <EmptyState size="sm" icon={DollarSign} title="Nenhum lançamento" description="Lançamentos são gerados a partir de serviços recorrentes." />
        ) : (
          <div className="divide-y">
            {lancamentos.map((l) => (
              <div key={l.id as string} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{(l.descricao as string) ?? 'Lançamento'}</p>
                  <p className="text-xs text-muted-foreground">Venc.: {l.dataVencimento ? formatDate(tsToDate(l.dataVencimento)) : '—'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(l.valor) || 0)}</p>
                  <PagamentoStatusBadge status={l.status as string} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
