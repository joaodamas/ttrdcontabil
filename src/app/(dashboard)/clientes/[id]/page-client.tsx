'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, limit } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatCpfCnpj, formatDate, formatCurrency, formatMesAno, tsToDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Timeline, type TimelineEvent } from '@/components/clientes/timeline'
import {
  ArrowLeft, Mail, MapPin, Pencil, ShieldCheck, ShieldAlert, ShieldOff,
  AlertTriangle, Plus, Receipt, Wallet, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela } from '@/lib/permissions'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo:     { label: 'Ativo',     variant: 'default' },
  inativo:   { label: 'Inativo',   variant: 'secondary' },
  suspenso:  { label: 'Suspenso',  variant: 'destructive' },
}

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento',
}

const REGIME_MAP: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento / Imune',
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { usuario } = useAuth()
  const podeAcessarFiscal = canAccessTela(usuario, 'fiscal')

  const [cliente,      setCliente]      = useState<Record<string, unknown> | null>(null)
  const [servicos,     setServicos]     = useState<Array<Record<string, unknown>>>([])
  const [competencias, setCompetencias] = useState<Array<Record<string, unknown>>>([])
  const [lancamentos,  setLancamentos]  = useState<Array<Record<string, unknown>>>([])
  const [fiscal,       setFiscal]       = useState<Record<string, unknown> | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [configOpen,   setConfigOpen]   = useState(false)

  function loadFiscal() {
    if (!id) return
    listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)])
      .then(data => setFiscal(data.length > 0 ? data[0] as Record<string, unknown> : null))
      .catch(() => null)
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    function get<T>(p: Promise<T>): Promise<T | null> { return p.catch(() => null) }
    Promise.all([
      get(getDocument('clientes', id)),
      get(listDocuments('clientes_servicos', [where('clienteId', '==', id), orderBy('dataInicio', 'desc'), limit(50)])),
      get(listDocuments('competencias',      [where('clienteId', '==', id), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)])),
      get(listDocuments('lancamentos',       [where('clienteId', '==', id), orderBy('dataVencimento', 'desc'), limit(20)])),
      get(listDocuments('clientes_fiscal',   [where('clienteId', '==', id), limit(1)])),
    ]).then(([clienteData, servicosData, competenciasData, lancamentosData, fiscalData]) => {
      if (!clienteData) { router.push('/clientes'); return }
      setCliente(clienteData as Record<string, unknown>)
      setServicos((servicosData ?? []) as Array<Record<string, unknown>>)
      setCompetencias((competenciasData ?? []) as Array<Record<string, unknown>>)
      setLancamentos((lancamentosData ?? []) as Array<Record<string, unknown>>)
      setFiscal(fiscalData && fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
    }).finally(() => setLoading(false))
  }, [id, router])

  /* ── timeline events ──────────────────────────────────── */
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const hoje = new Date()
    const events: TimelineEvent[] = []

    for (const c of competencias) {
      const ts = tsToDate((c.updatedAt ?? c.createdAt) as Timestamp | undefined) ?? new Date()
      const status = c.status as string
      events.push({
        id:          `comp-${c.id as string}`,
        type:        'competencia',
        title:       `Competência ${formatMesAno(c.mes as number, c.ano as number)}`,
        description: c.servicoNome as string | undefined,
        timestamp:   ts,
        variant:     status === 'concluida' ? 'success' : status === 'aberta' ? 'warning' : 'neutral',
        href:        `/competencias/${c.id as string}`,
        metadata:    status,
      })
    }
    for (const l of lancamentos) {
      const ts = tsToDate(l.dataVencimento as Timestamp | undefined) ?? new Date()
      const status = l.status as string
      const vencido = ts < hoje && status === 'pendente'
      events.push({
        id:        `lanc-${l.id as string}`,
        type:      'lancamento',
        title:     (l.descricao as string) ?? 'Lançamento',
        timestamp: ts,
        variant:   status === 'pago' ? 'success' : vencido ? 'destructive' : status === 'pendente' ? 'warning' : 'neutral',
        metadata:  formatCurrency(l.valor as number),
      })
    }
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 15)
  }, [competencias, lancamentos])

  /* ── proximosPassos ───────────────────────────────────── */
  const proximosPassos = useMemo(() => {
    const hoje = new Date()
    const list: Array<{ id: string; titulo: string; descricao: string; severidade: 'danger' | 'warning'; href?: string }> = []
    const competenciaAberta = competencias.find(c => (c.status as string) === 'aberta')
    if (competenciaAberta) list.push({ id: 'comp-aberta', titulo: 'Competência em aberto', descricao: `Pendente em ${formatMesAno(competenciaAberta.mes as number, competenciaAberta.ano as number)}.`, severidade: 'warning', href: `/competencias/${competenciaAberta.id as string}` })
    const lancAtrasado = lancamentos.find(l => { if ((l.status as string) !== 'pendente') return false; const v = tsToDate(l.dataVencimento); return !!v && v < hoje })
    if (lancAtrasado) list.push({ id: 'lanc-atrasado', titulo: 'Cobrança em atraso', descricao: `Lançamento vencido: ${(lancAtrasado.descricao as string) ?? 'sem descrição'}.`, severidade: 'danger', href: '/financeiro' })
    if (!fiscal) list.push({ id: 'fiscal-config', titulo: 'Configuração fiscal pendente', descricao: 'Cliente sem configuração NFS-e.', severidade: 'warning' })
    return list
  }, [competencias, lancamentos, fiscal])

  const competenciaAberta   = competencias.find(c => (c.status as string) === 'aberta')
  const lancamentoAtrasado  = lancamentos.find(l => { const v = tsToDate(l.dataVencimento); return (l.status as string) === 'pendente' && !!v && v < new Date() })

  const healthScore = (fiscal ? 1 : 0) + (!competenciaAberta ? 1 : 0) + (!lancamentoAtrasado ? 1 : 0)

  /* ── loading skeleton ─────────────────────────────────── */
  if (loading) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-2"><Skeleton className="h-5 w-56" /><Skeleton className="h-3 w-36" /></div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )

  if (!cliente) return null

  const statusInfo = STATUS_LABELS[cliente.status as string] ?? { label: String(cliente.status), variant: 'outline' as const }
  const creds      = (fiscal?.credenciais ?? {}) as Record<string, unknown>
  const ibge       = fiscal?.municipioIbge as string | undefined
  const tipo       = ibge ? MUNICIPIO_TIPO[ibge] : undefined
  const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? ibge ?? '—'
  const certInfo: CertInfo | null = creds.certTitular
    ? { titular: creds.certTitular as string, vencimento: creds.certVencimento as string, valido: creds.certValido as boolean, storagePath: creds.certificadoStoragePath as string }
    : null

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link href="/clientes">
          <Button variant="ghost" size="icon" className="h-9 w-9 mt-0.5"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold truncate">{cliente.razaoSocial as string}</h1>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          {(cliente.nomeFantasia as string | undefined) && <p className="text-sm text-muted-foreground truncate">{cliente.nomeFantasia as string}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <span className="font-mono text-xs text-muted-foreground">{formatCpfCnpj(cliente.cpfCnpj as string)}</span>
            {(cliente.regimeTributario as string | undefined) && <span className="text-xs text-muted-foreground">{REGIME_LABELS[cliente.regimeTributario as string] ?? String(cliente.regimeTributario)}</span>}
            {(cliente.email as string | undefined) && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{cliente.email as string}</span>}
            {((cliente.cidade as string | undefined) || (cliente.uf as string | undefined)) && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}</span>}
          </div>
        </div>
        <Link href={`/clientes/${id}/editar`}>
          <Button size="sm" variant="outline">Editar</Button>
        </Link>
      </div>

      {/* ── 70/30 grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px] items-start">

        {/* ── Left: Tabs ──────────────────────────────────── */}
        <Tabs defaultValue="atividade">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-4 gap-1">
            {(['atividade','competencias','servicos'] as const).map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted data-[state=active]:font-semibold"
              >
                {tab === 'atividade' ? 'Atividade' : tab === 'competencias' ? 'Competências' : 'Serviços'}
              </TabsTrigger>
            ))}
            {podeAcessarFiscal && (
              <TabsTrigger value="fiscal" className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted data-[state=active]:font-semibold">
                Fiscal
              </TabsTrigger>
            )}
          </TabsList>

          {/* Atividade */}
          <TabsContent value="atividade">
            <Timeline events={timelineEvents} />
          </TabsContent>

          {/* Competências */}
          <TabsContent value="competencias">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Competências</CardTitle>
                <div className="flex gap-2">
                  <Link href={`/competencias?clienteId=${id}`}><Button size="xs" variant="ghost">Ver todas</Button></Link>
                  <Link href={`/competencias/nova?clienteId=${id}`}><Button size="xs"><Plus className="h-3 w-3" />Nova</Button></Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {competencias.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhuma competência.</p>
                  : <div className="divide-y">
                      {competencias.map(c => (
                        <Link key={c.id as string} href={`/competencias/${c.id as string}`}
                          className="flex items-center justify-between py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded transition-colors">
                          <div>
                            <p className="text-sm font-medium">{formatMesAno(c.mes as number, c.ano as number)}</p>
                            {(c.servicoNome as string | undefined) && <p className="text-xs text-muted-foreground">{c.servicoNome as string}</p>}
                          </div>
                          <Badge variant={(c.status as string) === 'concluida' ? 'success' : (c.status as string) === 'aberta' ? 'warning' : 'neutral'}>
                            {c.status as string}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                }
              </CardContent>
            </Card>
          </TabsContent>

          {/* Serviços */}
          <TabsContent value="servicos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
                <Link href={`/clientes/${id}/servicos/novo`}><Button size="xs"><Plus className="h-3 w-3" />Serviço</Button></Link>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {servicos.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhum serviço vinculado.</p>
                  : <div className="divide-y">
                      {servicos.map(s => (
                        <div key={s.id as string} className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="text-sm font-medium">{s.servicoNome as string}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(s.valor as number)} • {s.dataInicio ? formatDate(tsToDate(s.dataInicio)) : '—'}
                            </p>
                          </div>
                          <Badge variant={s.status === 'ativo' ? 'default' : 'secondary'}>{s.status as string}</Badge>
                        </div>
                      ))}
                    </div>
                }
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fiscal */}
          <TabsContent value="fiscal" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Configuração NFS-e</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />{fiscal ? 'Editar' : 'Configurar'}
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {!fiscal
                  ? <div className="text-center py-6 space-y-3">
                      <p className="text-sm text-muted-foreground">Nenhuma configuração fiscal cadastrada.</p>
                      <Button size="sm" onClick={() => setConfigOpen(true)}>Configurar NFS-e</Button>
                    </div>
                  : <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                      <div><dt className="text-xs text-muted-foreground">Município</dt><dd className="font-medium">{municipioNome}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Ambiente</dt><dd><Badge variant={fiscal.ambienteEmissao === 'producao' ? 'default' : 'secondary'}>{fiscal.ambienteEmissao === 'producao' ? 'Produção' : 'Homologação'}</Badge></dd></div>
                      <div><dt className="text-xs text-muted-foreground">Insc. Municipal</dt><dd className="font-medium">{(fiscal.inscricaoMunicipal as string) ?? '—'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Regime</dt><dd className="font-medium">{REGIME_MAP[fiscal.regimeTributario as string] ?? '—'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Optante Simples</dt><dd className="font-medium">{fiscal.optanteSimples ? 'Sim' : 'Não'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Alíquota ISS</dt><dd className="font-medium">{fiscal.aliquotaPadrao != null ? `${fiscal.aliquotaPadrao}%` : '—'}</dd></div>
                    </dl>
                }
              </CardContent>
            </Card>

            {fiscal && tipo === 'abrasf_a1' && (
              <Card>
                <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                  {certInfo ? certInfo.valido ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-destructive" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
                  <CardTitle className="text-sm">Certificado Digital A1</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <CertificadoUpload clienteId={id} certInfo={certInfo} onUploaded={() => loadFiscal()} />
                </CardContent>
              </Card>
            )}

            {fiscal && podeAcessarFiscal && (
              <div className="flex justify-end">
                <Link href={`/fiscal/emitir?clienteId=${id}`}><Button size="sm"><Receipt className="h-3.5 w-3.5" />Emitir NFS-e</Button></Link>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Right: sticky aside ─────────────────────────── */}
        <div className="sticky top-20 space-y-4">

          {/* Saúde do cliente */}
          <Card>
            <CardHeader className="py-3 px-4"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Saúde do Cliente</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><Receipt className="h-3.5 w-3.5 text-muted-foreground" />Fiscal NFS-e</span>
                <Badge variant={fiscal ? 'success' : 'destructive'}>{fiscal ? 'Configurado' : 'Pendente'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />Competências</span>
                <Badge variant={competenciaAberta ? 'warning' : 'success'}>{competenciaAberta ? 'Em aberto' : 'Em dia'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><Wallet className="h-3.5 w-3.5 text-muted-foreground" />Financeiro</span>
                <Badge variant={lancamentoAtrasado ? 'destructive' : 'success'}>{lancamentoAtrasado ? 'Inadimplente' : 'Em dia'}</Badge>
              </div>
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Saúde geral</span>
                  <span className="text-xs font-semibold tabular-nums">{healthScore}/3</span>
                </div>
                <Progress value={(healthScore / 3) * 100} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* Próximos passos */}
          {proximosPassos.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Alertas</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {proximosPassos.map(item => {
                  const row = (
                    <div className={cn('flex items-start gap-2 rounded-md border-l-2 px-3 py-2', item.severidade === 'danger' ? 'border-destructive bg-destructive/4' : 'border-warning bg-warning/4')}>
                      <AlertTriangle className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', item.severidade === 'danger' ? 'text-destructive' : 'text-warning')} />
                      <div>
                        <p className="text-xs font-medium">{item.titulo}</p>
                        <p className="text-xs text-muted-foreground">{item.descricao}</p>
                      </div>
                    </div>
                  )
                  return item.href
                    ? <Link key={item.id} href={item.href} className="block hover:opacity-90 transition-opacity">{row}</Link>
                    : <div key={item.id}>{row}</div>
                })}
              </CardContent>
            </Card>
          )}

          {/* Ações rápidas */}
          <Card>
            <CardHeader className="py-3 px-4"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Ações Rápidas</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 min-[280px]:grid-cols-2 gap-2">
                <Link href={`/competencias/nova?clienteId=${id}`}>
                  <button className="w-full aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                    <Plus className="h-5 w-5 text-primary" />
                    <span className="text-xs font-medium leading-tight">Nova Competência</span>
                  </button>
                </Link>
                {fiscal && podeAcessarFiscal && (
                  <Link href={`/fiscal/emitir?clienteId=${id}`}>
                    <button className="w-full aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                      <Receipt className="h-5 w-5 text-primary" />
                      <span className="text-xs font-medium leading-tight">Emitir NFS-e</span>
                    </button>
                  </Link>
                )}
                <Link href={`/financeiro?clienteId=${id}`}>
                  <button className="w-full aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium leading-tight">Financeiro</span>
                  </button>
                </Link>
                <Link href={`/clientes/${id}/editar`}>
                  <button className="w-full aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                    <Pencil className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium leading-tight">Editar</span>
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── ConfigFiscalForm modal ───────────────────────── */}
      <ConfigFiscalForm
        open={configOpen}
        onOpenChange={setConfigOpen}
        clienteId={id}
        docId={fiscal?.id as string | undefined}
        defaultValues={fiscal ? {
          municipioIbge:        fiscal.municipioIbge       as string,
          inscricaoMunicipal:   fiscal.inscricaoMunicipal  as string,
          inscricaoEstadual:    fiscal.inscricaoEstadual   as string,
          ambienteEmissao:      (fiscal.ambienteEmissao    as 'homologacao' | 'producao') ?? 'homologacao',
          regimeTributario:     fiscal.regimeTributario    as string,
          optanteSimples:       (fiscal.optanteSimples     as boolean) ?? true,
          incentivadorCultural: (fiscal.incentivadorCultural as boolean) ?? false,
          naturezaOperacao:     (fiscal.naturezaOperacao   as string) ?? '1',
          itemListaServico:     fiscal.itemListaServico    as string,
          cnae:                 fiscal.cnae                as string,
          aliquotaPadrao:       fiscal.aliquotaPadrao      as number,
          credenciais:          (fiscal.credenciais        as Record<string, unknown>) ?? {},
        } : undefined}
        onSaved={loadFiscal}
      />
    </div>
  )
}
