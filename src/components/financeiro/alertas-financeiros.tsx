'use client'

import Link from 'next/link'
import { formatCurrency, tsToDate } from '@/lib/utils'
import { AlertTriangle, TrendingUp, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Lancamento = Record<string, unknown>

interface AlertaFinanceiro {
  id: string
  nivel: 'danger' | 'warning' | 'info'
  titulo: string
  detalhe: string
  href?: string
}

export function AlertasFinanceiros({ lancamentos, agora }: { lancamentos: Lancamento[]; agora: Date }) {
  const receitas = lancamentos.filter(l => (l.tipo as string) === 'receita' || l.tipo == null)
  const pendentes = receitas.filter(l => (l.status as string) === 'pendente')

  const alertas: AlertaFinanceiro[] = []

  // Vencimento hoje
  const hoje = agora.toDateString()
  const venceHoje = pendentes.filter(l => { const v = tsToDate(l.dataVencimento); return !!v && v.toDateString() === hoje })
  if (venceHoje.length > 0) {
    const total = venceHoje.reduce((s, l) => s + (Number(l.valor) || 0), 0)
    alertas.push({ id: 'hoje', nivel: 'warning', titulo: `${venceHoje.length} cobrança${venceHoje.length !== 1 ? 's' : ''} vence${venceHoje.length === 1 ? '' : 'm'} hoje`, detalhe: `${formatCurrency(total)} devem ser recebidos hoje`, href: '/financeiro?status=pendente' })
  }

  // Concentração por cliente
  const totaisPorCliente = new Map<string, number>()
  for (const l of pendentes) {
    const key = (l.clienteNome as string) ?? 'Sem cliente'
    totaisPorCliente.set(key, (totaisPorCliente.get(key) ?? 0) + (Number(l.valor) || 0))
  }
  const totalGeral = Array.from(totaisPorCliente.values()).reduce((a, b) => a + b, 0)
  if (totalGeral > 0) {
    for (const [nome, total] of totaisPorCliente) {
      if (total / totalGeral > 0.45) {
        alertas.push({ id: `conc-${nome}`, nivel: 'warning', titulo: 'Concentração de receita alta', detalhe: `${nome} representa ${Math.round((total / totalGeral) * 100)}% do total a receber` })
        break
      }
    }
  }

  // Cliente com múltiplas cobranças atrasadas
  const atrasadosPorCliente = new Map<string, number>()
  for (const l of pendentes) {
    const v = tsToDate(l.dataVencimento)
    if (!v || v >= agora) continue
    const key = (l.clienteNome as string) ?? 'Sem cliente'
    atrasadosPorCliente.set(key, (atrasadosPorCliente.get(key) ?? 0) + 1)
  }
  const maisAtrasado = Array.from(atrasadosPorCliente.entries()).sort((a, b) => b[1] - a[1])[0]
  if (maisAtrasado && maisAtrasado[1] >= 2) {
    alertas.push({ id: 'multi-atraso', nivel: 'danger', titulo: 'Inadimplência recorrente detectada', detalhe: `${maisAtrasado[0]} tem ${maisAtrasado[1]} cobranças vencidas`, href: '/financeiro?status=atrasado' })
  }

  // Previsão próximos 30 dias
  const em30 = new Date(agora); em30.setDate(agora.getDate() + 30)
  const proximos30 = pendentes.filter(l => { const v = tsToDate(l.dataVencimento); return !!v && v >= agora && v <= em30 })
  const total30 = proximos30.reduce((s, l) => s + (Number(l.valor) || 0), 0)

  if (alertas.length === 0 && total30 === 0) return null

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Alertas e Previsão Financeira</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {alertas.map(a => (
          <div key={a.id} className={`flex items-start gap-2.5 rounded-lg border-l-2 px-3 py-2 ${a.nivel === 'danger' ? 'border-destructive bg-destructive/5' : a.nivel === 'warning' ? 'border-warning bg-warning/5' : 'border-primary bg-primary/5'}`}>
            <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${a.nivel === 'danger' ? 'text-destructive' : a.nivel === 'warning' ? 'text-warning' : 'text-primary'}`} />
            <div className="min-w-0">
              <p className="text-xs font-semibold">{a.titulo}</p>
              <p className="text-xs text-muted-foreground">{a.detalhe}</p>
            </div>
            {a.href && <Link href={a.href} className="ml-auto shrink-0 text-[11px] font-medium text-primary hover:underline">Ver</Link>}
          </div>
        ))}

        {total30 > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Previsão 30 dias</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold tabular-nums text-success">{formatCurrency(total30)}</span>
              <span className="text-xs text-muted-foreground">{proximos30.length} lançamento{proximos30.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (total30 / Math.max(1, totalGeral + total30)) * 100)}%` }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
