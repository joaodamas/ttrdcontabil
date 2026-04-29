'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, limit } from 'firebase/firestore'

import { getDocument, listDocuments, getClienteTimeline, type ClienteTimelineEvento } from '@/lib/firestore-client'
import {
  cn,
  formatCpfCnpj,
  formatDate,
  formatCurrency,
  formatMesAno,
  tsToDate,
} from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/inline-alert'
import {
  ArrowLeft,
  Mail,
  MapPin,
  Loader2,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  LayoutDashboard,
  ListChecks,
  Wallet,
  FileText,
} from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo: { label: 'Ativo', variant: 'default' },
  inativo: { label: 'Inativo', variant: 'secondary' },
  suspenso: { label: 'Suspenso', variant: 'destructive' },
}

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  mei: 'MEI',
  isento: 'Isento',
}

type SaudeChip = 'ok' | 'atencao' | 'risco'

function HealthChip({ label, estado }: { label: string; estado: SaudeChip }) {
  const cfg = {
    ok: {
      dot: 'bg-emerald-500',
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      titulo: 'text-emerald-900 dark:text-emerald-100',
      sub: 'Sem alertas no escopo atual',
    },
    atencao: {
      dot: 'bg-amber-500',
      border: 'border-amber-500/25',
      bg: 'bg-amber-500/5',
      titulo: 'text-amber-950 dark:text-amber-100',
      sub: 'Acompanhar',
    },
    risco: {
      dot: 'bg-destructive',
      border: 'border-destructive/25',
      bg: 'bg-destructive/5',
      titulo: 'text-destructive',
      sub: 'Ação necessária',
    },
  }[estado]
  return (
    <div
      className={`flex min-w-[140px] flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${cfg.border} ${cfg.bg}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${cfg.titulo}`}>{label}</p>
        <p className="truncate text-[10px] text-muted-foreground">{cfg.sub}</p>
      </div>
    </div>
  )
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [cliente,     setCliente]     = useState<Record<string, unknown> | null>(null)
  const [servicos,    setServicos]    = useState<Array<Record<string, unknown>>>([])
  const [competencias,setCompetencias]= useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [fiscal,      setFiscal]      = useState<Record<string, unknown> | null>(null)
  const [timeline,    setTimeline]    = useState<ClienteTimelineEvento[]>([])
  const [loading,     setLoading]     = useState(true)
  const [configOpen,  setConfigOpen]  = useState(false)
  const [activeSection, setActiveSection] = useState<string>('sec-timeline')

  const sectionNavItems = useMemo(
    () =>
      [
        { id: 'sec-timeline', label: 'Timeline', count: timeline.length },
        { id: 'sec-servicos', label: 'Serviços', count: servicos.length },
        { id: 'sec-competencias', label: 'Competências', count: competencias.length },
        { id: 'sec-financeiro', label: 'Financeiro', count: lancamentos.length },
        { id: 'sec-fiscal', label: 'Fiscal' },
      ] as const,
    [timeline.length, servicos.length, competencias.length, lancamentos.length]
  )

  function loadFiscal() {
    if (!id) return
    listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)])
      .then(data => setFiscal(data.length > 0 ? data[0] as Record<string, unknown> : null))
      .catch(() => null)
  }

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => {
      setLoading(true)

      function get<T>(p: Promise<T>): Promise<T | null> {
        return p.catch(() => null)
      }

      Promise.all([
        get(getDocument('clientes', id)),
        get(listDocuments('clientes_servicos', [where('clienteId', '==', id), orderBy('dataInicio', 'desc')])),
        get(listDocuments('competencias', [where('clienteId', '==', id), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)])),
        get(listDocuments('lancamentos', [where('clienteId', '==', id), orderBy('dataVencimento', 'desc'), limit(20)])),
        get(listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)])),
        get(getClienteTimeline(id, 60)),
      ]).then(([clienteData, servicosData, competenciasData, lancamentosData, fiscalData, timelineData]) => {
        if (!clienteData) {
          router.push('/clientes')
          return
        }
        setCliente(clienteData as Record<string, unknown>)
        setServicos((servicosData ?? []) as Array<Record<string, unknown>>)
        setCompetencias((competenciasData ?? []) as Array<Record<string, unknown>>)
        setLancamentos((lancamentosData ?? []) as Array<Record<string, unknown>>)
        setFiscal(fiscalData && fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
        setTimeline((timelineData ?? []) as ClienteTimelineEvento[])
      }).finally(() => setLoading(false))
    })
  }, [id, router])

  useEffect(() => {
    if (!cliente || loading) return
    let obs: IntersectionObserver | null = null
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      const els = sectionNavItems
        .map((s) => document.getElementById(s.id))
        .filter((n): n is HTMLElement => !!n)
      if (els.length === 0) return
      obs = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting && e.intersectionRatio > 0)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          const sid = visible[0]?.target?.id
          if (sid) setActiveSection(sid)
        },
        { root: null, rootMargin: '-10% 0px -42% 0px', threshold: [0, 0.08, 0.2, 0.35] }
      )
      els.forEach((el) => obs!.observe(el))
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      obs?.disconnect()
    }
  }, [cliente, loading, sectionNavItems])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!cliente) return null

  const statusInfo = STATUS_LABELS[cliente.status as string] ?? { label: String(cliente.status), variant: 'outline' as const }

  const agora = new Date()
  const saudeFinanceiro: SaudeChip = (() => {
    const overdue = lancamentos.some((l) => {
      if (l.status !== 'pendente' || l.tipo !== 'receita') return false
      const d = tsToDate(l.dataVencimento)
      return !!d && d < agora
    })
    if (overdue) return 'risco'
    if (lancamentos.some((l) => l.status === 'pendente' && l.tipo === 'receita')) return 'atencao'
    return 'ok'
  })()

  const saudeFiscal: SaudeChip = fiscal ? 'ok' : 'risco'

  const saudeOperacional: SaudeChip = (() => {
    const critico = timeline.some(
      (e) =>
        e.severidade === 'alta' &&
        ['tarefa', 'competencia', 'fiscal', 'nfse', 'lancamento'].includes(e.tipo)
    )
    if (critico) return 'risco'
    if (competencias.some((c) => c.status === 'aberta' || c.status === 'em_andamento')) return 'atencao'
    return 'ok'
  })()

  type ProximoPasso = { titulo: string; desc: string; href: string; destaque: 'danger' | 'warning' | 'default' }
  const proximosPassos: ProximoPasso[] = []
  if (!fiscal) {
    proximosPassos.push({
      titulo: 'Configurar NFS-e',
      desc: 'Sem configuração fiscal — emissão e conformidade ficam bloqueadas.',
      href: `/clientes/${id}/fiscal`,
      destaque: 'danger',
    })
  }
  const recebivelAtrasado = lancamentos.find((l) => {
    if (l.status !== 'pendente' || l.tipo !== 'receita') return false
    const d = tsToDate(l.dataVencimento)
    return !!d && d < agora
  })
  if (recebivelAtrasado) {
    proximosPassos.push({
      titulo: 'Cobrar recebível atrasado',
      desc: String(recebivelAtrasado.descricao ?? 'Receita pendente'),
      href: `/financeiro?clienteId=${id}&status=pendente`,
      destaque: 'danger',
    })
  }
  const compAberta = competencias.find((c) => c.status === 'aberta' || c.status === 'em_andamento')
  if (compAberta) {
    proximosPassos.push({
      titulo: `Competência ${formatMesAno(compAberta.mes as number, compAberta.ano as number)}`,
      desc: 'Avance o fechamento operacional deste período.',
      href: `/competencias/${compAberta.id}`,
      destaque: 'warning',
    })
  }
  if (proximosPassos.length === 0) {
    proximosPassos.push({
      titulo: 'Próxima entrega com o cliente',
      desc: 'Sem pendências críticas detectadas — registre tarefa ou cobrança preventiva.',
      href: `/tarefas?clienteId=${id}`,
      destaque: 'default',
    })
  }
  const passosExibir = proximosPassos.slice(0, 3)

  return (
    <div className="stack-6">
      <div className="flex items-center gap-3">
        <Link href="/clientes">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-title">{cliente.razaoSocial as string}</h2>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          {cliente.nomeFantasia ? (
            <p className="text-subtle">{cliente.nomeFantasia as string}</p>
          ) : null}
        </div>
        <Link href={`/clientes/${id}/editar`}>
          <Button size="sm" variant="outline">
            Editar
          </Button>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)] lg:items-start">
        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Saúde do cliente
              </p>
              <div className="flex flex-col gap-2">
                <HealthChip label="Operacional" estado={saudeOperacional} />
                <HealthChip label="Fiscal" estado={saudeFiscal} />
                <HealthChip label="Financeiro" estado={saudeFinanceiro} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/tarefas?clienteId=${id}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                Tarefas
              </Link>
              <Link
                href={`/financeiro?clienteId=${id}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <Wallet className="mr-1.5 h-3.5 w-3.5" />
                Financeiro
              </Link>
              <Link
                href={`/clientes/${id}/fiscal`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Fiscal
              </Link>
              <Link
                href={`/competencias?clienteId=${id}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
                Competências
              </Link>
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Próximos passos sugeridos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {passosExibir.map((p, i) => (
                  <Link
                    key={`${p.href}-${i}`}
                    href={p.href}
                    className={`flex flex-col rounded-lg border px-3 py-2 transition-colors hover:bg-background/80 sm:flex-row sm:items-center sm:justify-between ${
                      p.destaque === 'danger'
                        ? 'border-destructive/30 bg-destructive/5'
                        : p.destaque === 'warning'
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-border/80 bg-card'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{p.titulo}</p>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </div>
                    <span className="mt-1 text-xs font-medium text-primary sm:mt-0">Abrir →</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resumo cadastral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground">CPF / CNPJ</p>
                <p className="font-mono text-xs font-medium break-all">
                  {formatCpfCnpj(cliente.cpfCnpj as string)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Regime tributário</p>
                <p className="text-xs font-medium">
                  {cliente.regimeTributario
                    ? REGIME_LABELS[cliente.regimeTributario as string] ?? String(cliente.regimeTributario)
                    : '—'}
                </p>
              </div>
              {cliente.email ? (
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" /> E-mail
                  </p>
                  <p className="text-xs font-medium break-all">{cliente.email as string}</p>
                </div>
              ) : null}
              {(cliente.cidade || cliente.uf) ? (
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" /> Localização
                  </p>
                  <p className="text-xs font-medium">
                    {[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>

        <div className="order-2 min-w-0 space-y-8 lg:order-1">
          <nav
            aria-label="Seções do cliente"
            className="sticky top-14 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border/80 bg-card/95 px-2 py-2 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-card/80"
          >
            {sectionNavItems.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  setActiveSection(s.id)
                }}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeSection === s.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {s.label}
                {'count' in s ? ` (${s.count})` : ''}
              </button>
            ))}
          </nav>

          <section id="sec-timeline" className="scroll-mt-28">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cliente 360 — Histórico unificado</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.some((ev) => ev.severidade === 'alta') && (
                <InlineAlert
                  tone="warning"
                  title="Há eventos de alta severidade"
                  description="Priorize os itens críticos para evitar impacto no fechamento e no financeiro."
                  className="mb-3"
                />
              )}
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum evento ainda nesta linha do tempo. Tarefas, competências, fiscal e financeiro passam a aparecer aqui
                  conforme o time trabalha o cliente.
                </p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((ev) => (
                    <div key={ev.id} className="surface-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{ev.titulo}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant={ev.severidade === 'alta' ? 'destructive' : ev.severidade === 'media' ? 'secondary' : 'outline'}>
                            {ev.severidade}
                          </Badge>
                          <Badge variant="outline">{ev.tipo}</Badge>
                        </div>
                      </div>
                      {ev.descricao ? (
                        <p className="text-xs text-muted-foreground mt-1">{ev.descricao}</p>
                      ) : null}
                      <div className="mt-1 flex items-center gap-2">
                        {ev.actorAvatarUrl ? (
                          <img
                            src={ev.actorAvatarUrl}
                            alt={ev.actorNome ?? 'Ator'}
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                            {(ev.actorNome ?? '—').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">Ator: </span>
                          {ev.actorNome ?? 'Sistema'}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tsToDate(ev.data))} • {ev.origemColecao ?? 'events'}
                        </p>
                        {ev.href ? (
                          <Link href={ev.href} className="text-xs text-primary hover:underline">
                            Abrir
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </section>

          <section id="sec-servicos" className="scroll-mt-28">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
              <Link href={`/clientes/${id}/servicos/novo`}>
                <Button size="sm">+ Serviço</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {servicos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum serviço vinculado. Cadastre contratos e honorários para refletir o escopo atendido.
                </p>
              ) : (
                <div className="divide-y">
                  {servicos.map((s) => (
                    <div key={s.id as string} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{s.servicoNome as string}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(s.valor as number)} •{' '}
                          {s.dataInicio
                            ? formatDate(tsToDate(s.dataInicio))
                            : '—'}
                        </p>
                      </div>
                      <Badge
                        variant={s.status === 'ativo' ? 'default' : 'secondary'}
                      >
                        {s.status as string}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </section>

          <section id="sec-competencias" className="scroll-mt-28">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Competências</CardTitle>
              <Link href={`/competencias?clienteId=${id}`}>
                <Button size="sm" variant="outline">Ver todas</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {competencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma competência registrada. Abra uma competência para acompanhar o fechamento por período.
                </p>
              ) : (
                <div className="divide-y">
                  {competencias.map((c) => (
                    <Link
                      key={c.id as string}
                      href={`/competencias/${c.id}`}
                      className="py-3 flex items-center justify-between hover:bg-muted/30 px-2 -mx-2 rounded transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {formatMesAno(c.mes as number, c.ano as number)}
                        </p>
                        {c.servicoNome ? (
                          <p className="text-xs text-muted-foreground">{c.servicoNome as string}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline">{c.status as string}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </section>

          <section id="sec-financeiro" className="scroll-mt-28">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Lançamentos</CardTitle>
              <Link href={`/financeiro?clienteId=${id}`}>
                <Button size="sm" variant="outline">Ver todos</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {lancamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum lançamento recente. Lançamentos de receita e despesa aparecem aqui com atalho para o financeiro.
                </p>
              ) : (
                <div className="divide-y">
                  {lancamentos.map((l) => (
                    <div key={l.id as string} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{l.descricao as string}</p>
                        <p className="text-xs text-muted-foreground">
                          Venc.:{' '}
                          {l.dataVencimento
                            ? formatDate(tsToDate(l.dataVencimento))
                            : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatCurrency(l.valor as number)}
                        </p>
                        <Badge
                          variant={
                            l.status === 'pago'
                              ? 'default'
                              : l.status === 'cancelado'
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {l.status as string}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </section>

          <section id="sec-fiscal" className="scroll-mt-28 space-y-4">
          {(() => {
            const creds      = (fiscal?.credenciais ?? {}) as Record<string, unknown>
            const ibge       = fiscal?.municipioIbge as string | undefined
            const tipo       = ibge ? MUNICIPIO_TIPO[ibge] : undefined
            const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? ibge ?? '—'
            const REGIME_MAP: Record<string, string> = {
              simples_nacional: 'Simples Nacional',
              lucro_presumido:  'Lucro Presumido',
              lucro_real:       'Lucro Real',
              mei:              'MEI',
              isento:           'Isento / Imune',
            }
            const certInfo: CertInfo | null = creds.certTitular
              ? { titular: creds.certTitular as string, vencimento: creds.certVencimento as string, valido: creds.certValido as boolean, storagePath: creds.certificadoStoragePath as string }
              : null

            return (
              <>
                {/* Config card */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-sm">Configuração Fiscal — NFS-e</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      {fiscal ? 'Editar' : 'Configurar'}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {!fiscal ? (
                      <div className="text-center py-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Nenhuma configuração fiscal cadastrada.
                        </p>
                        <Button size="sm" onClick={() => setConfigOpen(true)}>
                          Configurar NFS-e
                        </Button>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-muted-foreground text-xs">Município</dt>
                          <dd className="font-medium">{municipioNome}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Ambiente</dt>
                          <dd>
                            {fiscal.ambienteEmissao === 'producao'
                              ? <Badge variant="default" className="text-xs">Produção</Badge>
                              : <Badge variant="secondary" className="text-xs">Homologação</Badge>}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Inscrição Municipal</dt>
                          <dd className="font-medium">{(fiscal.inscricaoMunicipal as string) ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Regime</dt>
                          <dd className="font-medium">{REGIME_MAP[fiscal.regimeTributario as string] ?? (fiscal.regimeTributario as string) ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Optante Simples</dt>
                          <dd className="font-medium">{fiscal.optanteSimples ? 'Sim' : 'Não'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">Alíquota ISS</dt>
                          <dd className="font-medium">{fiscal.aliquotaPadrao != null ? `${fiscal.aliquotaPadrao}%` : '—'}</dd>
                        </div>
                        {fiscal.itemListaServico ? (
                          <div>
                            <dt className="text-muted-foreground text-xs">Item Lista Serviço</dt>
                            <dd className="font-medium">{fiscal.itemListaServico as string}</dd>
                          </div>
                        ) : null}
                        {fiscal.cnae ? (
                          <div>
                            <dt className="text-muted-foreground text-xs">CNAE</dt>
                            <dd className="font-medium">{fiscal.cnae as string}</dd>
                          </div>
                        ) : null}
                      </dl>
                    )}
                  </CardContent>
                </Card>

                {/* Certificado A1 */}
                {fiscal && tipo === 'abrasf_a1' && (
                  <Card>
                    <CardHeader className="flex flex-row items-center gap-2 pb-3">
                      {certInfo
                        ? certInfo.valido
                          ? <ShieldCheck className="w-4 h-4 text-green-600" />
                          : <ShieldAlert className="w-4 h-4 text-destructive" />
                        : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
                      <CardTitle className="text-sm">Certificado Digital A1</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CertificadoUpload
                        clienteId={id}
                        certInfo={certInfo}
                        onUploaded={() => loadFiscal()}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Emitir NFS-e */}
                {fiscal && (
                  <div className="flex justify-end">
                    <Link href={`/fiscal/emitir?clienteId=${id}`}>
                      <Button size="sm">+ Emitir NFS-e</Button>
                    </Link>
                  </div>
                )}
              </>
            )
          })()}

          <ConfigFiscalForm
            open={configOpen}
            onOpenChange={setConfigOpen}
            clienteId={id}
            docId={fiscal?.id as string | undefined}
            defaultValues={fiscal ? {
              municipioIbge:       fiscal.municipioIbge      as string,
              inscricaoMunicipal:  fiscal.inscricaoMunicipal as string,
              inscricaoEstadual:   fiscal.inscricaoEstadual  as string,
              ambienteEmissao:     (fiscal.ambienteEmissao   as 'homologacao' | 'producao') ?? 'homologacao',
              regimeTributario:    fiscal.regimeTributario   as string,
              optanteSimples:      (fiscal.optanteSimples    as boolean) ?? true,
              incentivadorCultural:(fiscal.incentivadorCultural as boolean) ?? false,
              naturezaOperacao:    (fiscal.naturezaOperacao  as string) ?? '1',
              itemListaServico:    fiscal.itemListaServico   as string,
              cnae:                fiscal.cnae               as string,
              aliquotaPadrao:      fiscal.aliquotaPadrao     as number,
              credenciais:         (fiscal.credenciais       as Record<string, unknown>) ?? {},
            } : undefined}
            onSaved={loadFiscal}
          />
          </section>
        </div>
      </div>
    </div>
  )
}
