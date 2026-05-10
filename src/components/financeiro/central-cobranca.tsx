'use client'

import Link from 'next/link'
import { formatCurrency, tsToDate } from '@/lib/utils'
import { topConcentracaoClientes, somaReceitaPendenteProximasHoras } from '@/lib/financeiro-prioridade'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, TrendingDown, Users2, Clock } from 'lucide-react'

type Lancamento = Record<string, unknown>

type AgingBucket = {
  label: string
  dias: [number, number] // [min, max] — max = Infinity para aberto
  variant: 'success' | 'warning' | 'destructive' | 'neutral'
}

const AGING_BUCKETS: AgingBucket[] = [
  { label: 'A vencer',   dias: [-Infinity, 0],  variant: 'success' },
  { label: '1–15 dias',  dias: [1, 15],          variant: 'warning' },
  { label: '16–30 dias', dias: [16, 30],          variant: 'warning' },
  { label: '31–60 dias', dias: [31, 60],          variant: 'destructive' },
  { label: '61+ dias',   dias: [61, Infinity],    variant: 'destructive' },
]

function calcAging(lancamentos: Lancamento[], agora: Date) {
  return AGING_BUCKETS.map(bucket => {
    let total = 0
    let count = 0
    for (const l of lancamentos) {
      if (l.tipo !== 'receita' || l.status !== 'pendente') continue
      const venc = tsToDate(l.dataVencimento)
      if (!venc) continue
      const diasAtraso = Math.floor((agora.getTime() - venc.getTime()) / 86_400_000)
      const [min, max] = bucket.dias
      if (diasAtraso >= min && diasAtraso <= max) {
        total += Number(l.valor) || 0
        count++
      }
    }
    return { ...bucket, total, count }
  })
}

interface CentralCobrancaProps {
  lancamentos: Lancamento[]
  agora: Date
}

export function CentralCobranca({ lancamentos, agora }: CentralCobrancaProps) {
  const aging = calcAging(lancamentos, agora)
  const totalEmAtraso = aging.filter(b => b.dias[0] >= 1).reduce((s, b) => s + b.total, 0)
  const concentracao = topConcentracaoClientes(lancamentos, agora, 5)
  const { total: proximasCash, qtd: proximasQtd } = somaReceitaPendenteProximasHoras(lancamentos, agora, 168) // 7 dias

  if (aging.every(b => b.count === 0) && concentracao.length === 0) return null

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
                    style={{ width: `${Math.min(100, (bucket.total / Math.max(1, totalEmAtraso + aging[0].total)) * 100)}%` }}
                  />
                )}
              </div>
              <div className="flex items-center gap-2 min-w-[140px] justify-end">
                <Badge variant={bucket.variant} className="text-[10px]">{bucket.count}</Badge>
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
