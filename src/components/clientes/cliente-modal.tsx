'use client'

import { useState, useEffect, useCallback } from 'react'
import { where, orderBy, limit } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatCpfCnpj, formatDate, formatCurrency, formatMesAno, tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ClienteStatusBadge, CompetenciaStatusBadge, PagamentoStatusBadge, NfseStatusBadge, AmbienteBadge } from '@/components/ui/status-badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Mail, MapPin, Phone, DollarSign, Pencil,
  ShieldCheck, ShieldAlert, ShieldOff, ExternalLink,
  Briefcase, CalendarDays, Receipt, Settings, AlertTriangle,
} from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { ClienteServicoDialog } from '@/components/clientes/cliente-servico-dialog'
import { clientesKeys } from '@/features/clientes/queries'

const TAB_CONTENT_CLASS = 'mt-3 min-h-0 max-h-[calc(100dvh-19rem)] overflow-y-auto overscroll-contain md:max-h-[430px]'
const MODAL_TAB_TRIGGER_CLASS = 'h-9 min-w-0 justify-center gap-1.5 rounded-lg px-2 text-xs'
const MODAL_CARD_CLASS = 'border-border/70 shadow-none'
const MODAL_CARD_HEADER_CLASS = 'flex flex-row items-center justify-between px-4 py-3'
const MODAL_CARD_CONTENT_CLASS = 'px-4 pb-4'

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento',
}

interface ClienteModalProps {
  clienteId: string
  clienteNome: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function TabCount({ count }: { count?: number }) {
  const hasCount = typeof count === 'number' && count > 0

  return (
    <span
      aria-hidden={!hasCount}
      className={`w-[4ch] shrink-0 text-right text-[10px] leading-none opacity-60 tabular-nums ${hasCount ? '' : 'invisible'}`}
    >
      ({hasCount ? count : 0})
    </span>
  )
}

export function ClienteModal({ clienteId, clienteNome, open, onOpenChange }: ClienteModalProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [loading,     setLoading]     = useState(false)
  const [cliente,     setCliente]     = useState<Record<string, unknown> | null>(null)
  const [servicos,    setServicos]    = useState<Array<Record<string, unknown>>>([])
  const [competencias,setCompetencias]= useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [nfses,       setNfses]       = useState<Array<Record<string, unknown>>>([])
  const [fiscal,      setFiscal]      = useState<Record<string, unknown> | null>(null)
  const [configOpen,  setConfigOpen]  = useState(false)
  const [servicoDialogOpen, setServicoDialogOpen] = useState(false)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  const load = useCallback(() => {
    if (!clienteId) return
    setLoading(true)
    setLoadError(null)
    setCliente(null)
    setServicos([])
    setCompetencias([])
    setLancamentos([])
    setNfses([])
    setFiscal(null)

    Promise.allSettled([
      getDocument('clientes', clienteId),
      listDocuments('clientes_servicos', [where('clienteId', '==', clienteId), limit(50)]),
      listDocuments('competencias', [where('clienteId', '==', clienteId), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(12)]),
      listDocuments('lancamentos', [where('clienteId', '==', clienteId), orderBy('dataVencimento', 'desc'), limit(10)]),
      listDocuments('nfse_emitidas', [where('clienteId', '==', clienteId), orderBy('criadoEm', 'desc'), limit(20)]),
      listDocuments('clientes_fiscal', [where('clienteId', '==', clienteId), limit(1)]),
    ]).then(([clienteR, servicosR, competenciasR, lancamentosR, nfseEmitR, fiscalR]) => {
      if (clienteR.status === 'fulfilled' && clienteR.value) {
        setCliente(clienteR.value as Record<string, unknown>)
      } else {
        setCliente(null)
        setLoadError('Cliente não encontrado ou sem permissão de acesso.')
      }
      if (servicosR.status === 'fulfilled') {
        setServicos(
          (servicosR.value as Array<Record<string, unknown>>).sort((a, b) => {
            const aDate = tsToDate(a.dataInicio)?.getTime() ?? 0
            const bDate = tsToDate(b.dataInicio)?.getTime() ?? 0
            return bDate - aDate
          })
        )
      }
      if (competenciasR.status === 'fulfilled') setCompetencias(competenciasR.value as Array<Record<string, unknown>>)
      if (lancamentosR.status === 'fulfilled') setLancamentos(lancamentosR.value as Array<Record<string, unknown>>)
      if (fiscalR.status === 'fulfilled') {
        const fd = fiscalR.value as Array<Record<string, unknown>>
        setFiscal(fd.length > 0 ? fd[0] : null)
      }
      if (nfseEmitR.status === 'fulfilled') {
        setNfses(nfseEmitR.value as Array<Record<string, unknown>>)
      }
    }).finally(() => setLoading(false))
  }, [clienteId])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => { void load() })
  }, [open, load])

  function navigateTo(path: string) {
    onOpenChange(false)
    router.push(path)
  }

  async function syncClienteAfterMutation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clientesKeys.all }),
      queryClient.invalidateQueries({ queryKey: clientesKeys.detail(clienteId) }),
    ])
    load()
  }

  const valorMensalAtivo = servicos
    .filter((s) => s.status === 'ativo')
    .reduce((acc, s) => acc + ((s.valor as number) ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!w-[min(900px,calc(100vw-2rem))] !max-w-[min(900px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden gap-0 p-0 sm:min-h-[560px]"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 border-b bg-background px-5 py-4">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="truncate text-base font-semibold leading-tight">
                  {cliente ? (cliente.razaoSocial as string) : clienteNome}
                </DialogTitle>
                {cliente?.status ? (
                  <ClienteStatusBadge status={cliente.status as string} />
                ) : null}
              </div>
              {cliente?.nomeFantasia ? (
                <p className="text-xs text-muted-foreground mt-0.5">{cliente.nomeFantasia as string}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-muted-foreground"
                onClick={() => navigateTo(`/clientes/${clienteId}`)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ver completo</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => navigateTo(`/clientes/${clienteId}/editar`)}>
                Editar
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="min-h-0 overflow-hidden">
          {loading ? (
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-8 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ) : !cliente ? (
            <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-warning" />
              <div>
                <p className="text-sm font-medium">Cliente indisponível</p>
                <p className="mt-1 text-xs text-muted-foreground">{loadError ?? 'Não foi possível carregar este cliente.'}</p>
              </div>
              <Link
                href="/clientes"
                onClick={() => onOpenChange(false)}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                Voltar para clientes
              </Link>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col">
              {/* Info strip */}
              <div className="shrink-0 border-b bg-muted/25 px-5 py-3">
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-5">
                  <div>
                    <dt className="text-xs text-muted-foreground">CPF / CNPJ</dt>
                    <dd className="mt-0.5 break-words font-mono text-sm font-medium leading-snug">{formatCpfCnpj(cliente.cpfCnpj as string)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Regime</dt>
                    <dd className="mt-0.5 text-sm font-medium leading-snug">
                      {cliente.regimeTributario
                        ? REGIME_LABELS[cliente.regimeTributario as string] ?? String(cliente.regimeTributario)
                        : '—'}
                    </dd>
                  </div>
                  {cliente.email ? (
                    <div>
                      <dt className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />E-mail</dt>
                      <dd className="text-sm font-medium mt-0.5 truncate">{cliente.email as string}</dd>
                    </div>
                  ) : null}
                  {cliente.telefone ? (
                    <div>
                      <dt className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Telefone</dt>
                      <dd className="mt-0.5 text-sm font-medium leading-snug">{cliente.telefone as string}</dd>
                    </div>
                  ) : null}
                  {(cliente.cidade || cliente.uf) ? (
                    <div>
                      <dt className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Cidade / UF</dt>
                      <dd className="mt-0.5 text-sm font-medium leading-snug">
                        {[cliente.cidade as string, cliente.uf as string].filter(Boolean).join(' / ')}
                      </dd>
                    </div>
                  ) : null}
                  <div className="col-span-2 md:col-span-1">
                    <dt className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Valor Mensal</dt>
                    <dd className={`text-base font-bold tabular-nums mt-0.5 ${valorMensalAtivo > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {valorMensalAtivo > 0 ? formatCurrency(valorMensalAtivo) : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* 4 tabs */}
              <div className="min-h-0 px-5 py-4">
                <Tabs defaultValue="servicos" className="min-h-0">
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/70 p-1 md:h-10 md:grid-cols-4">
                    <TabsTrigger value="servicos" className={MODAL_TAB_TRIGGER_CLASS}>
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>Serviços</span>
                      <TabCount count={servicos.length} />
                    </TabsTrigger>
                    <TabsTrigger value="operacional" className={MODAL_TAB_TRIGGER_CLASS}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>Operacional</span>
                      <TabCount count={competencias.length} />
                    </TabsTrigger>
                    <TabsTrigger value="financeiro" className={MODAL_TAB_TRIGGER_CLASS}>
                      <DollarSign className="h-3.5 w-3.5" />
                      <span>Financeiro</span>
                      <TabCount count={lancamentos.length} />
                    </TabsTrigger>
                    <TabsTrigger value="fiscal" className={MODAL_TAB_TRIGGER_CLASS}>
                      <Receipt className="h-3.5 w-3.5" />
                      <span>Fiscal</span>
                      <TabCount count={nfses.length} />
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Serviços ─────────────────────────────────── */}
                  <TabsContent value="servicos" className={TAB_CONTENT_CLASS}>
                    <Card className={MODAL_CARD_CLASS}>
                      <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                        <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
                        <Button size="sm" className="h-8" onClick={() => setServicoDialogOpen(true)}>
                          + Serviço
                        </Button>
                      </CardHeader>
                      <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                        {servicos.length === 0 ? (
                          <EmptyState
                            icon={Briefcase}
                            title="Nenhum serviço vinculado"
                            description="Adicione serviços para gerar competências automaticamente."
                            action={{ label: '+ Vincular Serviço', onClick: () => setServicoDialogOpen(true) }}
                          />
                        ) : (
                          <>
                            <div className="divide-y">
                              {servicos.map((s) => (
                                <div key={s.id as string} className="flex items-center justify-between gap-4 py-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{s.servicoNome as string}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {s.dataInicio ? `Desde ${formatDate(tsToDate(s.dataInicio))}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-3">
                                    <span className="text-sm font-bold tabular-nums">{formatCurrency((s.valor as number) ?? 0)}</span>
                                    <Badge variant={s.status === 'ativo' ? 'success' : 'secondary'}>
                                      {s.status === 'ativo' ? 'Ativo' : String(s.status)}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                              <span className="text-muted-foreground">Total mensal (ativos)</span>
                              <span className="font-bold text-primary tabular-nums">{formatCurrency(valorMensalAtivo)}</span>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Operacional (Competências) ────────────────── */}
                  <TabsContent value="operacional" className={TAB_CONTENT_CLASS}>
                    <Card className={MODAL_CARD_CLASS}>
                      <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                        <CardTitle className="text-sm">Competências Recentes</CardTitle>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => navigateTo(`/competencias?clienteId=${clienteId}`)}>
                          Ver todas
                        </Button>
                      </CardHeader>
                      <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                        {competencias.length === 0 ? (
                          <EmptyState
                            icon={CalendarDays}
                            title="Nenhuma competência"
                            description="Competências são criadas automaticamente a cada mês para serviços ativos."
                          />
                        ) : (
                          <div className="divide-y">
                            {competencias.map((c) => (
                              <button
                                type="button"
                                key={c.id as string}
                                onClick={() => navigateTo(`/competencias/${c.id}`)}
                                className="flex w-full items-center justify-between rounded px-2 py-3 text-left transition-colors hover:bg-muted/30 -mx-2"
                              >
                                <div>
                                  <p className="text-sm font-medium">
                                    {formatMesAno(c.mes as number, c.ano as number)}
                                  </p>
                                  {c.servicoNome ? (
                                    <p className="text-xs text-muted-foreground">{c.servicoNome as string}</p>
                                  ) : null}
                                </div>
                                <CompetenciaStatusBadge status={c.status as string} />
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Financeiro ───────────────────────────────── */}
                  <TabsContent value="financeiro" className={TAB_CONTENT_CLASS}>
                    <Card className={MODAL_CARD_CLASS}>
                      <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                        <CardTitle className="text-sm">Lançamentos Recentes</CardTitle>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => navigateTo(`/financeiro?clienteId=${clienteId}`)}>
                          Ver todos
                        </Button>
                      </CardHeader>
                      <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                        {lancamentos.length === 0 ? (
                          <EmptyState
                            icon={DollarSign}
                            title="Nenhum lançamento"
                            description="Lançamentos são gerados a partir de serviços recorrentes."
                          />
                        ) : (
                          <div className="divide-y">
                            {lancamentos.map((l) => (
                              <div key={l.id as string} className="py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium">{l.descricao as string}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Venc.: {l.dataVencimento ? formatDate(tsToDate(l.dataVencimento)) : '—'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold tabular-nums">{formatCurrency((l.valor as number) ?? 0)}</p>
                                  <PagamentoStatusBadge status={l.status as string} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Fiscal (config + NFS-e) ───────────────────── */}
                  <TabsContent value="fiscal" className={`${TAB_CONTENT_CLASS} space-y-3`}>
                    {(() => {
                      const creds      = (fiscal?.credenciais ?? {}) as Record<string, unknown>
                      const ibge       = fiscal?.municipioIbge as string | undefined
                      const tipo       = ibge ? MUNICIPIO_TIPO[ibge] : undefined
                      const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? ibge ?? '—'
                      const certInfo: CertInfo | null = creds.certTitular
                        ? { titular: creds.certTitular as string, vencimento: creds.certVencimento as string, valido: creds.certValido as boolean, storagePath: creds.certificadoStoragePath as string }
                        : null

                      const REGIME_MAP: Record<string, string> = {
                        simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido',
                        lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento / Imune',
                      }

                      return (
                        <>
                          {/* Config card */}
                          <Card className="border-border/70 shadow-none">
                            <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Settings className="w-4 h-4 text-muted-foreground" />
                                Configuração NFS-e
                              </CardTitle>
                              <Button size="sm" variant="outline" className="h-8" onClick={() => setConfigOpen(true)}>
                                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                {fiscal ? 'Editar' : 'Configurar'}
                              </Button>
                            </CardHeader>
                            <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                              {!fiscal ? (
                                <EmptyState
                                  title="Sem configuração fiscal"
                                  description="Configure o município e as credenciais para emitir NFS-e."
                                  action={{ label: 'Configurar NFS-e', onClick: () => setConfigOpen(true) }}
                                />
                              ) : (
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                  <div>
                                    <dt className="text-muted-foreground text-xs">Município</dt>
                                    <dd className="font-medium">{municipioNome}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground text-xs">Ambiente</dt>
                                    <dd><AmbienteBadge ambiente={fiscal.ambienteEmissao as string} /></dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground text-xs">Insc. Municipal</dt>
                                    <dd className="font-medium">{(fiscal.inscricaoMunicipal as string) ?? '—'}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground text-xs">Regime</dt>
                                    <dd className="font-medium">{REGIME_MAP[fiscal.regimeTributario as string] ?? (fiscal.regimeTributario as string) ?? '—'}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground text-xs">Alíquota ISS</dt>
                                    <dd className="font-medium">{fiscal.aliquotaPadrao != null ? `${fiscal.aliquotaPadrao}%` : '—'}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground text-xs">Optante Simples</dt>
                                    <dd className="font-medium">{fiscal.optanteSimples ? 'Sim' : 'Não'}</dd>
                                  </div>
                                </dl>
                              )}
                            </CardContent>
                          </Card>

                          {/* Certificado A1 */}
                          {fiscal && (tipo === 'abrasf_a1' || tipo === 'geisweb_a1') && (
                            <Card className="border-border/70 shadow-none">
                              <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
                                {certInfo
                                  ? certInfo.valido
                                    ? <ShieldCheck className="w-4 h-4 text-success" />
                                    : <ShieldAlert className="w-4 h-4 text-destructive" />
                                  : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
                                <CardTitle className="text-sm">Certificado Digital A1</CardTitle>
                              </CardHeader>
                              <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                                <CertificadoUpload clienteId={clienteId} certInfo={certInfo} onUploaded={() => { void syncClienteAfterMutation() }} />
                              </CardContent>
                            </Card>
                          )}

                          {/* Histórico NFS-e */}
                          <Card className="border-border/70 shadow-none">
                            <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-muted-foreground" />
                                Histórico NFS-e
                                {nfses.length > 0 && (
                                  <span className="text-xs text-muted-foreground">({nfses.length})</span>
                                )}
                              </CardTitle>
                              {fiscal && (
                                <Button size="sm" className="h-8" onClick={() => navigateTo(`/fiscal/emitir?clienteId=${clienteId}`)}>
                                  + Emitir
                                </Button>
                              )}
                            </CardHeader>
                            <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                              {nfses.length === 0 ? (
                                <EmptyState
                                  icon={Receipt}
                                  title="Nenhuma NFS-e emitida"
                                  {...(fiscal ? { action: { label: 'Emitir NFS-e', href: `/fiscal/emitir?clienteId=${clienteId}` } } : {})}
                                />
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 text-xs font-medium text-muted-foreground">Nº NFS-e</th>
                                      <th className="text-left py-2 text-xs font-medium text-muted-foreground">Emissão</th>
                                      <th className="text-right py-2 text-xs font-medium text-muted-foreground">Valor</th>
                                      <th className="text-left py-2 pl-4 text-xs font-medium text-muted-foreground">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {nfses.map((n) => (
                                      <tr key={n.id as string} className="hover:bg-muted/30">
                                        <td className="py-2.5 font-mono text-xs">{(n.numeroNfse as string) ?? '—'}</td>
                                        <td className="py-2.5 text-muted-foreground">
                                          {n.dataEmissao ? formatDate(tsToDate(n.dataEmissao)) : '—'}
                                        </td>
                                        <td className="py-2.5 text-right font-medium tabular-nums">{formatCurrency((n.valorServico as number) ?? 0)}</td>
                                        <td className="py-2.5 pl-4"><NfseStatusBadge status={n.status as string} /></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </CardContent>
                          </Card>
                        </>
                      )
                    })()}

                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
        <ClienteServicoDialog
          open={servicoDialogOpen}
          onOpenChange={setServicoDialogOpen}
          clienteId={clienteId}
          onSaved={() => { void syncClienteAfterMutation() }}
        />
        <ConfigFiscalForm
          open={configOpen}
          onOpenChange={setConfigOpen}
          clienteId={clienteId}
          docId={fiscal?.id as string | undefined}
          defaultValues={fiscal ? {
            municipioIbge: fiscal.municipioIbge as string,
            inscricaoMunicipal: fiscal.inscricaoMunicipal as string,
            inscricaoEstadual: fiscal.inscricaoEstadual as string,
            ambienteEmissao: (fiscal.ambienteEmissao as 'homologacao' | 'producao') ?? 'homologacao',
            regimeTributario: fiscal.regimeTributario as string,
            optanteSimples: (fiscal.optanteSimples as boolean) ?? true,
            incentivadorCultural: (fiscal.incentivadorCultural as boolean) ?? false,
            naturezaOperacao: (fiscal.naturezaOperacao as string) ?? '1',
            codigoServicoPadrao: fiscal.codigoServicoPadrao as string,
            descricaoServicoPadrao: fiscal.descricaoServicoPadrao as string,
            itemListaServico: fiscal.itemListaServico as string,
            cnae: fiscal.cnae as string,
            aliquotaPadrao: fiscal.aliquotaPadrao as number,
            issRetidoPadrao: (fiscal.issRetidoPadrao as boolean) ?? false,
            credenciais: (fiscal.credenciais as Record<string, unknown>) ?? {},
          } : undefined}
          onSaved={() => { void syncClienteAfterMutation() }}
        />
      </DialogContent>
    </Dialog>
  )
}
