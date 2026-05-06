'use client'

import { useState, useEffect, useCallback } from 'react'
import { where, orderBy, limit } from 'firebase/firestore'
import Link from 'next/link'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { cn, formatCpfCnpj, formatDate, formatCurrency, formatMesAno, tsToDate } from '@/lib/utils'
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

export function ClienteModal({ clienteId, clienteNome, open, onOpenChange }: ClienteModalProps) {
  const [loading,     setLoading]     = useState(false)
  const [cliente,     setCliente]     = useState<Record<string, unknown> | null>(null)
  const [servicos,    setServicos]    = useState<Array<Record<string, unknown>>>([])
  const [competencias,setCompetencias]= useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [nfses,       setNfses]       = useState<Array<Record<string, unknown>>>([])
  const [fiscal,      setFiscal]      = useState<Record<string, unknown> | null>(null)
  const [configOpen,  setConfigOpen]  = useState(false)
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
      listDocuments('clientes_servicos', [where('clienteId', '==', clienteId), orderBy('dataInicio', 'desc'), limit(50)]),
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
      if (servicosR.status === 'fulfilled') setServicos(servicosR.value as Array<Record<string, unknown>>)
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

  const valorMensalAtivo = servicos
    .filter((s) => s.status === 'ativo')
    .reduce((acc, s) => acc + ((s.valor as number) ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="w-full max-h-[88vh] flex flex-col overflow-hidden p-0"
        style={{ maxWidth: '740px' }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-semibold">
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
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <Link
                href={`/clientes/${clienteId}`}
                onClick={() => onOpenChange(false)}
                className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'gap-1.5 text-muted-foreground')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ver completo</span>
              </Link>
              <Link
                href={`/clientes/${clienteId}/editar`}
                onClick={() => onOpenChange(false)}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                Editar
              </Link>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
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
            <div>
              {/* Info strip */}
              <div className="px-5 py-4 border-b bg-muted/30">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">CPF / CNPJ</dt>
                    <dd className="text-sm font-medium font-mono mt-0.5">{formatCpfCnpj(cliente.cpfCnpj as string)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Regime</dt>
                    <dd className="text-sm font-medium mt-0.5">
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
                      <dd className="text-sm font-medium mt-0.5">{cliente.telefone as string}</dd>
                    </div>
                  ) : null}
                  {(cliente.cidade || cliente.uf) ? (
                    <div>
                      <dt className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Cidade / UF</dt>
                      <dd className="text-sm font-medium mt-0.5">
                        {[cliente.cidade as string, cliente.uf as string].filter(Boolean).join(' / ')}
                      </dd>
                    </div>
                  ) : null}
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Valor Mensal</dt>
                    <dd className={`text-base font-bold mt-0.5 ${valorMensalAtivo > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {valorMensalAtivo > 0 ? formatCurrency(valorMensalAtivo) : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* 4 tabs */}
              <div className="px-5 py-4">
                <Tabs defaultValue="servicos">
                  <TabsList className="w-full grid grid-cols-4">
                    <TabsTrigger value="servicos" className="gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      Serviços
                      {servicos.length > 0 && (
                        <span className="text-[10px] opacity-60">({servicos.length})</span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="operacional" className="gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Operacional
                      {competencias.length > 0 && (
                        <span className="text-[10px] opacity-60">({competencias.length})</span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="financeiro" className="gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      Financeiro
                      {lancamentos.length > 0 && (
                        <span className="text-[10px] opacity-60">({lancamentos.length})</span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="fiscal" className="gap-1.5">
                      <Receipt className="h-3.5 w-3.5" />
                      Fiscal
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Serviços ─────────────────────────────────── */}
                  <TabsContent value="servicos" className="mt-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
                        <Link href={`/clientes/${clienteId}/servicos/novo`}>
                          <Button size="sm">+ Serviço</Button>
                        </Link>
                      </CardHeader>
                      <CardContent>
                        {servicos.length === 0 ? (
                          <EmptyState
                            icon={Briefcase}
                            title="Nenhum serviço vinculado"
                            description="Adicione serviços para gerar competências automaticamente."
                            action={{ label: '+ Vincular Serviço', href: `/clientes/${clienteId}/servicos/novo` }}
                          />
                        ) : (
                          <>
                            <div className="divide-y">
                              {servicos.map((s) => (
                                <div key={s.id as string} className="py-3 flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium">{s.servicoNome as string}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {s.dataInicio ? `Desde ${formatDate(tsToDate(s.dataInicio))}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold">{formatCurrency((s.valor as number) ?? 0)}</span>
                                    <Badge variant={s.status === 'ativo' ? 'success' : 'secondary'}>
                                      {s.status === 'ativo' ? 'Ativo' : String(s.status)}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                              <span className="text-muted-foreground">Total mensal (ativos)</span>
                              <span className="font-bold text-primary">{formatCurrency(valorMensalAtivo)}</span>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Operacional (Competências) ────────────────── */}
                  <TabsContent value="operacional" className="mt-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-sm">Competências Recentes</CardTitle>
                        <Link href={`/competencias?clienteId=${clienteId}`}>
                          <Button size="sm" variant="outline">Ver todas</Button>
                        </Link>
                      </CardHeader>
                      <CardContent>
                        {competencias.length === 0 ? (
                          <EmptyState
                            icon={CalendarDays}
                            title="Nenhuma competência"
                            description="Competências são criadas automaticamente a cada mês para serviços ativos."
                          />
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
                                <CompetenciaStatusBadge status={c.status as string} />
                              </Link>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Financeiro ───────────────────────────────── */}
                  <TabsContent value="financeiro" className="mt-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-sm">Lançamentos Recentes</CardTitle>
                        <Link href={`/financeiro?clienteId=${clienteId}`}>
                          <Button size="sm" variant="outline">Ver todos</Button>
                        </Link>
                      </CardHeader>
                      <CardContent>
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
                                  <p className="text-sm font-bold">{formatCurrency((l.valor as number) ?? 0)}</p>
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
                  <TabsContent value="fiscal" className="mt-3 space-y-3">
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
                          <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-3">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Settings className="w-4 h-4 text-muted-foreground" />
                                Configuração NFS-e
                              </CardTitle>
                              <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                {fiscal ? 'Editar' : 'Configurar'}
                              </Button>
                            </CardHeader>
                            <CardContent>
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
                            <Card>
                              <CardHeader className="flex flex-row items-center gap-2 pb-3">
                                {certInfo
                                  ? certInfo.valido
                                    ? <ShieldCheck className="w-4 h-4 text-success" />
                                    : <ShieldAlert className="w-4 h-4 text-destructive" />
                                  : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
                                <CardTitle className="text-sm">Certificado Digital A1</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <CertificadoUpload clienteId={clienteId} certInfo={certInfo} onUploaded={() => load()} />
                              </CardContent>
                            </Card>
                          )}

                          {/* Histórico NFS-e */}
                          <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-3">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-muted-foreground" />
                                Histórico NFS-e
                                {nfses.length > 0 && (
                                  <span className="text-xs text-muted-foreground">({nfses.length})</span>
                                )}
                              </CardTitle>
                              {fiscal && (
                                <Link href={`/fiscal/emitir?clienteId=${clienteId}`}>
                                  <Button size="sm">+ Emitir</Button>
                                </Link>
                              )}
                            </CardHeader>
                            <CardContent>
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
                                        <td className="py-2.5 text-right font-medium">{formatCurrency((n.valorServico as number) ?? 0)}</td>
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

                    <ConfigFiscalForm
                      open={configOpen}
                      onOpenChange={setConfigOpen}
                      clienteId={clienteId}
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
                      onSaved={load}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
