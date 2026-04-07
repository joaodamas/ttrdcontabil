'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'

import { listDocuments } from '@/lib/firestore-client'
import { formatCurrency, formatDate, formatMesAno } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  ClipboardList,
  CheckSquare,
  TrendingUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react'

export default function DashboardPage() {
  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()
  const mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1
  const anoAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual

  const [loading, setLoading] = useState(true)
  const [totalClientesAtivos, setTotalClientesAtivos] = useState(0)
  const [compCounts, setCompCounts] = useState<Record<string, number>>({})
  const [tarefasPendentes, setTarefasPendentes] = useState(0)
  const [somaVencendo, setSomaVencendo] = useState(0)
  const [vencendoCount, setVencendoCount] = useState(0)
  const [somaAtrasados, setSomaAtrasados] = useState(0)
  const [atrasadosCount, setAtrasadosCount] = useState(0)
  const [tarefasVencidas, setTarefasVencidas] = useState<Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>>([])
  const [competenciasAbertasAnteriores, setCompetenciasAbertasAnteriores] = useState<Array<{ id: string; clienteNome?: string; mes: number; ano: number }>>([])
  const [lancamentosVencidos, setLancamentosVencidos] = useState<Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>>([])

  useEffect(() => {
    const em7Dias = new Date(hoje)
    em7Dias.setDate(hoje.getDate() + 7)

    const hojeTs = Timestamp.fromDate(hoje)
    const em7DiasTs = Timestamp.fromDate(em7Dias)

    Promise.all([
      // Clientes ativos
      listDocuments('clientes', [where('status', '==', 'ativo')]),
      // Competências do mês atual
      listDocuments('competencias', [where('mes', '==', mesAtual), where('ano', '==', anoAtual)]),
      // Tarefas pendentes
      listDocuments('tarefas', [where('status', 'in', ['pendente', 'em_andamento'])]),
      // Lançamentos vencendo em 7 dias
      listDocuments('lancamentos', [
        where('tipo', '==', 'receita'),
        where('status', '==', 'pendente'),
        where('dataVencimento', '>=', hojeTs),
        where('dataVencimento', '<=', em7DiasTs),
      ]),
      // Lançamentos em atraso
      listDocuments('lancamentos', [
        where('tipo', '==', 'receita'),
        where('status', '==', 'pendente'),
        where('dataVencimento', '<', hojeTs),
      ]),
      // Tarefas vencidas (top 5)
      listDocuments('tarefas', [
        where('dataPrazo', '<', hojeTs),
        where('status', 'in', ['pendente', 'em_andamento']),
        orderBy('dataPrazo', 'asc'),
        limit(5),
      ]),
      // Competências abertas mês anterior (top 5)
      listDocuments('competencias', [
        where('mes', '==', mesAnterior),
        where('ano', '==', anoAnterior),
        where('status', '==', 'aberta'),
        limit(5),
      ]),
      // Lançamentos vencidos (top 5)
      listDocuments('lancamentos', [
        where('tipo', '==', 'receita'),
        where('status', '==', 'pendente'),
        where('dataVencimento', '<', hojeTs),
        orderBy('dataVencimento', 'asc'),
        limit(5),
      ]),
    ]).then(([
      clientesData,
      compMesData,
      tarefasData,
      vencendoData,
      atrasadosData,
      tarefasVencidasData,
      compAbertasData,
      lancVencidosData,
    ]) => {
      setTotalClientesAtivos(clientesData.length)

      const counts: Record<string, number> = {}
      compMesData.forEach((d) => {
        const s = (d as Record<string, unknown>).status as string
        counts[s] = (counts[s] ?? 0) + 1
      })
      setCompCounts(counts)

      setTarefasPendentes(tarefasData.length)

      const sumVencendo = vencendoData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0)
      setSomaVencendo(sumVencendo)
      setVencendoCount(vencendoData.length)

      const sumAtrasados = atrasadosData.reduce((acc, d) => acc + (((d as Record<string, unknown>).valor as number) ?? 0), 0)
      setSomaAtrasados(sumAtrasados)
      setAtrasadosCount(atrasadosData.length)

      setTarefasVencidas(tarefasVencidasData as Array<{ id: string; titulo: string; clienteNome?: string; dataPrazo?: Timestamp }>)
      setCompetenciasAbertasAnteriores(compAbertasData as Array<{ id: string; clienteNome?: string; mes: number; ano: number }>)
      setLancamentosVencidos(lancVencidosData as Array<{ id: string; descricao: string; clienteNome?: string; valor: number; dataVencimento: Timestamp }>)
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Visão geral — {formatMesAno(mesAtual, anoAtual)}
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clientes Ativos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalClientesAtivos}</p>
            <Link href="/clientes?status=ativo" className="text-xs text-primary hover:underline">
              Ver todos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Competências {formatMesAno(mesAtual, anoAtual)}
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Abertas:</span>
              <Badge variant="outline">{compCounts['aberta'] ?? 0}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Em andamento:</span>
              <Badge variant="secondary">{compCounts['em_andamento'] ?? 0}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Concluídas:</span>
              <Badge>{compCounts['concluida'] ?? 0}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tarefas Abertas
              </CardTitle>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{tarefasPendentes}</p>
            <Link href="/tarefas?status=pendente" className="text-xs text-primary hover:underline">
              Ver tarefas
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                A Receber (7 dias)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(somaVencendo)}</p>
            <p className="text-xs text-muted-foreground">
              {vencendoCount} lançamento{vencendoCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Em Atraso
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(somaAtrasados)}</p>
            <p className="text-xs text-muted-foreground">
              {atrasadosCount} lançamento{atrasadosCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Listas rápidas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tarefas vencidas */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Tarefas Vencidas</CardTitle>
              <Link href="/tarefas" className="text-xs text-primary hover:underline">
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {tarefasVencidas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma tarefa vencida.</p>
            ) : (
              <ul className="divide-y">
                {tarefasVencidas.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tarefas/${t.id}`}
                      className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium truncate">{t.titulo}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {t.clienteNome ?? '—'}
                      </span>
                      {t.dataPrazo ? (
                        <span className="text-xs text-destructive">
                          Prazo: {formatDate(t.dataPrazo.toDate())}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Competências abertas mês anterior */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Competências Abertas — {formatMesAno(mesAnterior, anoAnterior)}
              </CardTitle>
              <Link
                href={`/competencias?mes=${mesAnterior}&ano=${anoAnterior}&status=aberta`}
                className="text-xs text-primary hover:underline"
              >
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {competenciasAbertasAnteriores.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma competência em aberto.</p>
            ) : (
              <ul className="divide-y">
                {competenciasAbertasAnteriores.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/competencias/${c.id}`}
                      className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium truncate">
                        {c.clienteNome ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMesAno(c.mes, c.ano)}
                      </span>
                      <Badge variant="outline" className="w-fit text-xs">
                        aberta
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Lançamentos vencidos */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Lançamentos Vencidos</CardTitle>
              <Link href="/financeiro?status=pendente" className="text-xs text-primary hover:underline">
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {lancamentosVencidos.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento vencido.</p>
            ) : (
              <ul className="divide-y">
                {lancamentosVencidos.map((l) => (
                  <li key={l.id}>
                    <Link
                      href="/financeiro"
                      className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium truncate">{l.descricao}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {l.clienteNome ?? '—'}
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-destructive">
                          Venc.: {formatDate(l.dataVencimento.toDate())}
                        </span>
                        <span className="text-xs font-medium">{formatCurrency(l.valor)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
