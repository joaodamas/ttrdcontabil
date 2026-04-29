import { tsToDate } from '@/lib/utils'

/** Prioridade para cobrança: receitas pendentes (atraso e valor pesam). */
export function scoreCobranca(l: Record<string, unknown>, agora: Date): number {
  if (l.tipo !== 'receita' || l.status !== 'pendente') return -1
  const venc = tsToDate(l.dataVencimento)
  const valor = Number(l.valor) || 0
  if (!venc) return Math.min(valor / 5000, 15)

  const msDay = 86_400_000
  const diasAtraso = venc < agora ? Math.floor((agora.getTime() - venc.getTime()) / msDay) : 0
  const diasParaVencer = venc >= agora ? Math.ceil((venc.getTime() - agora.getTime()) / msDay) : 0

  if (diasAtraso > 0) {
    return 100 + diasAtraso * 8 + Math.min(valor / 800, 40)
  }
  if (diasParaVencer <= 2) {
    return 55 + (2 - diasParaVencer) * 12 + Math.min(valor / 1500, 35)
  }
  return Math.min(valor / 4000, 18)
}

export function motivoPrioridade(l: Record<string, unknown>, agora: Date): string {
  const venc = tsToDate(l.dataVencimento)
  const valor = Number(l.valor) || 0
  if (!venc) return `Valor ${valor > 0 ? 'relevante' : 'a confirmar'} — definir vencimento`

  if (venc < agora) {
    const dias = Math.floor((agora.getTime() - venc.getTime()) / 86_400_000)
    return `Atraso ${dias}d · ${formatBrlHint(valor)}`
  }
  const h = Math.ceil((venc.getTime() - agora.getTime()) / 86_400_000)
  if (h <= 2) return `Vence em ${h}d · ${formatBrlHint(valor)}`
  return `Receita pendente · vence ${venc.toLocaleDateString('pt-BR')}`
}

function formatBrlHint(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}k`
  return `R$ ${n.toFixed(0)}`
}

export function somaReceitaPendenteProximasHoras(
  lancamentos: Array<Record<string, unknown>>,
  agora: Date,
  horas: number
): { total: number; qtd: number } {
  const limite = new Date(agora.getTime() + horas * 3_600_000)
  let total = 0
  let qtd = 0
  for (const l of lancamentos) {
    if (l.tipo !== 'receita' || l.status !== 'pendente') continue
    const v = tsToDate(l.dataVencimento)
    if (!v || v < agora || v > limite) continue
    total += Number(l.valor) || 0
    qtd += 1
  }
  return { total, qtd }
}

export function topConcentracaoClientes(
  lancamentos: Array<Record<string, unknown>>,
  agora: Date,
  topN: number
): Array<{ nome: string; total: number }> {
  const map = new Map<string, number>()
  for (const l of lancamentos) {
    if (l.tipo !== 'receita' || l.status !== 'pendente') continue
    const venc = tsToDate(l.dataVencimento)
    if (!venc || venc >= agora) continue
    const nome = (l.clienteNome as string) || 'Sem cliente'
    const val = Number(l.valor) || 0
    map.set(nome, (map.get(nome) ?? 0) + val)
  }
  return [...map.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN)
}
