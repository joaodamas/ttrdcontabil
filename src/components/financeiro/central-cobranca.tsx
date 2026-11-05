'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { topConcentracaoClientes, somaReceitaPendenteProximasHoras } from '@/lib/financeiro-prioridade'
import { calcularAging, paraItemAging, totalEmAberto, totalVencido } from '@/features/financeiro/aging'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, TrendingDown, Users2, Clock } from 'lucide-react'

type Lancamento = Record<string, unknown>

interface CentralCobrancaProps {
  /** Base inteira do filtro atual, não a página da tabela. */
  lancamentos: Lancamento[]
  agora: Date
}

export function CentralCobranca({ lancamentos, agora }: CentralCobrancaProps) {
  // Memo porque agora esta lista é a base inteira, não 20 linhas: sem isto o
  // aging seria recalculado a cada abertura de menu ou modal da página.
  const aging = useMemo(
    () => calcularAging(lancamentos.map(paraItemAging), agora),
    [lancamentos, agora]
  )
  const totalEmAtraso = totalVencido(aging)
  const totalAberto = totalEmAberto(aging)
  const concentracao = useMemo(
    () => topConcentracaoClientes(lancamentos, agora, 5),
    [lancamentos, agora]
  )
  const { total: proximasCash, qtd: proximasQtd } = useMemo(
    () => somaReceitaPendenteProximasHoras(lancamentos, agora, 168), // 7 dias
    [lancamentos, agora]
  )

  if (aging.every(b => b.quantidade === 0) && concentracao.length === 0) return null

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      {/* Aging financeiro */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <CardTitle className="text-sm">Aging de Recebíveis</CardTitle>
            </div>
            <span className={`text-sm font-bold tabular-nums ${totalEmAtraso > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {formatCurrency(totalEmAtraso)} em atraso
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {aging.map(bucket => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{bucket.label}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                {bucket.total > 0 && (
                  <div
                    className={`h-full rounded-full ${bucket.variant === 'destructive' ? 'bg-destructive' : bucket.variant === 'warning' ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${Math.min(100, (bucket.total / Math.max(1, totalAberto)) * 100)}%` }}
                  />
                )}
              </div>
              <div className="flex items-center gap-2 min-w-[140px] justify-end">
                <Badge variant={bucket.variant} className="text-[10px]">{bucket.quantidade}</Badge>
                <span className="text-xs font-semibold tabular-nums">{formatCurrency(bucket.total)}</span>
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Próximos 7 dias: {formatCurrency(proximasCash)} ({proximasQtd} lançamento{proximasQtd !== 1 ? 's' : ''})</span>
          </div>
        </CardContent>
      </Card>

      {/* Concentração por cliente */}
      {concentracao.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-warning" />
                <CardTitle className="text-sm">Top Inadimplentes</CardTitle>
              </div>
              <Link href="/clientes" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                Ver clientes <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {concentracao.map((item, i) => {
              const pct = totalEmAtraso > 0 ? (item.total / totalEmAtraso) * 100 : 0
              return (
                <div key={item.nome} className="flex items-center gap-3">
                  <span className="text-xs font-bold tabular-nums text-muted-foreground w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.nome}</p>
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-destructive shrink-0">{formatCurrency(item.total)}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
