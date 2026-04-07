export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatCurrency, formatDate, formatMesAno } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  ClipboardList,
  CheckSquare,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

export default async function DashboardPage() {
  await requireAuth()

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()
  const em7Dias = new Date(hoje)
  em7Dias.setDate(hoje.getDate() + 7)

  const mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1
  const anoAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual

  const hojeTs = Timestamp.fromDate(hoje)
  const em7DiasTs = Timestamp.fromDate(em7Dias)

  const [
    clientesSnap,
    competenciasMesSnap,
    tarefasAbertasSnap,
    lancamentosVencendoSnap,
    lancamentosAtrasadosSnap,
    tarefasVencidasSnap,
    competenciasAbertasAnterioresSnap,
    lancamentosVencidosSnap,
  ] = await Promise.all([
    // Clientes ativos
    adminDb.collection('clientes').where('status', '==', 'ativo').count().get(),

    // Competências do mês atual
    adminDb
      .collection('competencias')
      .where('mes', '==', mesAtual)
      .where('ano', '==', anoAtual)
      .get(),

    // Tarefas pendentes + em_andamento (usamos contagem separada)
    adminDb
      .collection('tarefas')
      .where('status', 'in', ['pendente', 'em_andamento'])
      .count()
      .get(),

    // Lançamentos receitas vencendo em 7 dias
    adminDb
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pendente')
      .where('dataVencimento', '>=', hojeTs)
      .where('dataVencimento', '<=', em7DiasTs)
      .get(),

    // Lançamentos em atraso
    adminDb
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pendente')
      .where('dataVencimento', '<', hojeTs)
      .get(),

    // Tarefas vencidas (top 5)
    adminDb
      .collection('tarefas')
      .where('dataPrazo', '<', hojeTs)
      .where('status', 'in', ['pendente', 'em_andamento'])
      .orderBy('dataPrazo', 'asc')
      .limit(5)
      .get(),

    // Competências abertas do mês anterior (top 5)
    adminDb
      .collection('competencias')
      .where('mes', '==', mesAnterior)
      .where('ano', '==', anoAnterior)
      .where('status', '==', 'aberta')
      .limit(5)
      .get(),

    // Lançamentos vencidos (top 5, mais antigos)
    adminDb
      .collection('lancamentos')
      .where('tipo', '==', 'receita')
      .where('status', '==', 'pendente')
      .where('dataVencimento', '<', hojeTs)
      .orderBy('dataVencimento', 'asc')
      .limit(5)
      .get(),
  ])

  const totalClientesAtivos = clientesSnap.data().count
  const tarefasPendentes = tarefasAbertasSnap.data().count

  // Agrupa competências por status
  const compCounts: Record<string, number> = {}
  competenciasMesSnap.docs.forEach((d) => {
    const s = d.data().status as string
    compCounts[s] = (compCounts[s] ?? 0) + 1
  })

  // Soma lançamentos vencendo
  const somaVencendo = lancamentosVencendoSnap.docs.reduce(
    (acc, d) => acc + ((d.data().valor as number) ?? 0),
    0
  )
  const somaAtrasados = lancamentosAtrasadosSnap.docs.reduce(
    (acc, d) => acc + ((d.data().valor as number) ?? 0),
    0
  )

  const tarefasVencidas = tarefasVencidasSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string
    titulo: string
    clienteNome?: string
    dataPrazo?: Timestamp
  }>

  const competenciasAbertasAnteriores = competenciasAbertasAnterioresSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Array<{ id: string; clienteNome?: string; mes: number; ano: number }>

  const lancamentosVencidos = lancamentosVencidosSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Array<{
    id: string
    descricao: string
    clienteNome?: string
    valor: number
    dataVencimento: Timestamp
  }>

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
              {lancamentosVencendoSnap.size} lançamento{lancamentosVencendoSnap.size !== 1 ? 's' : ''}
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
              {lancamentosAtrasadosSnap.size} lançamento{lancamentosAtrasadosSnap.size !== 1 ? 's' : ''}
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
