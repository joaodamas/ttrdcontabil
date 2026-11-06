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
import { AppModal } from '@/components/ui/app-modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Mail, MapPin, Phone, DollarSign, Pencil,
  ShieldCheck, ShieldAlert, ShieldOff, ExternalLink,
  Briefcase, CalendarDays, Receipt, Settings, AlertTriangle, Users, IdCard,
} from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO, defaultsDaConfigFiscal } from '@/components/fiscal/config-fiscal-form'
import { exigeCertificadoA1, nomeMunicipio } from '@/lib/nfse-dominios'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { EmitirNfseModal } from '@/components/fiscal/emitir-nfse-modal'
import { ClienteServicoDialog } from '@/components/clientes/cliente-servico-dialog'
import { clientesKeys } from '@/features/clientes/queries'
import { ClienteFichaCompleta } from '@/components/clientes/cliente-ficha-completa'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela, podeEscreverEm, podeOperarNfse } from '@/lib/permissions'
import { ehPermissaoNegada } from '@/lib/error-message'

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

/* Cada aba lê uma coleção com regra própria. allSettled engolia a rejeição e a
   aba mostrava "Nenhum lançamento"/"Sem configuração fiscal" — e oferecia
   "Configurar NFS-e" — quando o motivo era falta de permissão. */
type SecaoModal = 'servicos' | 'competencias' | 'lancamentos' | 'nfses' | 'fiscal'
type FalhaSecao = 'negado' | 'erro'

const GRID_ABAS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
}

function SecaoIndisponivel({ falha, onRetry }: { falha: FalhaSecao; onRetry: () => void }) {
  if (falha === 'negado') {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Sem acesso a este módulo"
        description="Seu perfil não permite ver estas informações. Se precisar, fale com o administrador."
      />
    )
  }
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar"
      description="A lista não foi lida — não quer dizer que esteja vazia."
      action={{ label: 'Tentar novamente', onClick: onRetry }}
    />
  )
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
  const { usuario } = useAuth()
  const verOperacional = canAccessTela(usuario, 'competencias')
  const verFinanceiro = canAccessTela(usuario, 'financeiro')
  const verFiscal = canAccessTela(usuario, 'fiscal')
  const podeEditarCliente = podeEscreverEm(usuario, 'clientes')
  const podeOperarFiscal = podeOperarNfse(usuario)
  const [falhas, setFalhas] = useState<Partial<Record<SecaoModal, FalhaSecao>>>({})
  const [loading,     setLoading]     = useState(false)
  const [cliente,     setCliente]     = useState<Record<string, unknown> | null>(null)
  const [servicos,    setServicos]    = useState<Array<Record<string, unknown>>>([])
  const [competencias,setCompetencias]= useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [nfses,       setNfses]       = useState<Array<Record<string, unknown>>>([])
  const [fiscal,      setFiscal]      = useState<Record<string, unknown> | null>(null)
  const [configOpen,  setConfigOpen]  = useState(false)
  const [servicoDialogOpen, setServicoDialogOpen] = useState(false)
  const [emitirOpen, setEmitirOpen] = useState(false)
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
    setFalhas({})

    // Aba escondida pelo perfil não lê nada (evita leituras que as regras negam).
    const vazio = Promise.resolve([] as Array<Record<string, unknown>>)
    Promise.allSettled([
      getDocument('clientes', clienteId),
      listDocuments('clientes_servicos', [where('clienteId', '==', clienteId), limit(50)]),
      verOperacional
        ? listDocuments('competencias', [where('clienteId', '==', clienteId), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(12)])
        : vazio,
      verFinanceiro
        ? listDocuments('lancamentos', [where('clienteId', '==', clienteId), orderBy('dataVencimento', 'desc'), limit(10)])
        : vazio,
      verFiscal
        ? listDocuments('nfse_emitidas', [where('clienteId', '==', clienteId), orderBy('criadoEm', 'desc'), limit(20)])
        : vazio,
      verFiscal
        ? listDocuments('clientes_fiscal', [where('clienteId', '==', clienteId), limit(1)])
        : vazio,
    ]).then(([clienteR, servicosR, competenciasR, lancamentosR, nfseEmitR, fiscalR]) => {
      const novasFalhas: Partial<Record<SecaoModal, FalhaSecao>> = {}
      const marcar = (secao: SecaoModal, r: PromiseSettledResult<unknown>) => {
        if (r.status === 'rejected') novasFalhas[secao] = ehPermissaoNegada(r.reason) ? 'negado' : 'erro'
      }
      marcar('servicos', servicosR)
      marcar('competencias', competenciasR)
      marcar('lancamentos', lancamentosR)
      marcar('nfses', nfseEmitR)
      marcar('fiscal', fiscalR)
      setFalhas(novasFalhas)
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
  }, [clienteId, verOperacional, verFinanceiro, verFiscal])

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
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={cliente ? (cliente.razaoSocial as string) : clienteNome}
      description={cliente?.nomeFantasia ? (cliente.nomeFantasia as string) : undefined}
      icon={<Users className="size-4" />}
      badge={cliente?.status ? <ClienteStatusBadge status={cliente.status as string} /> : undefined}
      size="wide"
      footer={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => navigateTo(`/clientes/${clienteId}`)}>
            <ExternalLink className="w-3.5 h-3.5" />Ver completo
          </Button>
          {podeEditarCliente && (
            <Button size="sm" variant="outline" onClick={() => navigateTo(`/clientes/${clienteId}/editar`)}>
              <Pencil className="w-3.5 h-3.5" />Editar
            </Button>
          )}
        </div>
      }
    >
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

              {/* Abas — a ficha completa abre primeiro: é o que se procura ao clicar no cliente */}
              <div className="min-h-0 px-5 py-4">
                <Tabs defaultValue="cadastro" className="min-h-0">
                  <TabsList className={`grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/70 p-1 md:h-10 ${GRID_ABAS[2 + Number(verOperacional) + Number(verFinanceiro) + Number(verFiscal)]}`}>
                    <TabsTrigger value="cadastro" className={MODAL_TAB_TRIGGER_CLASS}>
                      <IdCard className="h-3.5 w-3.5" />
                      <span>Cadastro</span>
                    </TabsTrigger>
                    <TabsTrigger value="servicos" className={MODAL_TAB_TRIGGER_CLASS}>
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>Serviços</span>
                      <TabCount count={servicos.length} />
                    </TabsTrigger>
                    {verOperacional && (
                      <TabsTrigger value="operacional" className={MODAL_TAB_TRIGGER_CLASS}>
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>Operacional</span>
                        <TabCount count={competencias.length} />
                      </TabsTrigger>
                    )}
                    {verFinanceiro && (
                      <TabsTrigger value="financeiro" className={MODAL_TAB_TRIGGER_CLASS}>
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>Financeiro</span>
                        <TabCount count={lancamentos.length} />
                      </TabsTrigger>
                    )}
                    {verFiscal && (
                      <TabsTrigger value="fiscal" className={MODAL_TAB_TRIGGER_CLASS}>
                        <Receipt className="h-3.5 w-3.5" />
                        <span>Fiscal</span>
                        <TabCount count={nfses.length} />
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* ── Cadastro (ficha completa) ───────────────── */}
                  <TabsContent value="cadastro" className={TAB_CONTENT_CLASS}>
                    {cliente && clienteId ? <ClienteFichaCompleta cliente={cliente} clienteId={clienteId} /> : null}
                  </TabsContent>

                  {/* ── Serviços ─────────────────────────────────── */}
                  <TabsContent value="servicos" className={TAB_CONTENT_CLASS}>
                    <Card className={MODAL_CARD_CLASS}>
                      <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                        <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
                        {podeEditarCliente && !falhas.servicos && (
                          <Button size="sm" className="h-8" onClick={() => setServicoDialogOpen(true)}>
                            + Serviço
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                        {falhas.servicos ? (
                          <SecaoIndisponivel falha={falhas.servicos} onRetry={load} />
                        ) : servicos.length === 0 ? (
                          <EmptyState
                            icon={Briefcase}
                            title="Nenhum serviço vinculado"
                            description={podeEditarCliente ? 'Adicione serviços para gerar competências automaticamente.' : 'Este cliente ainda não tem serviços vinculados.'}
                            {...(podeEditarCliente ? { action: { label: '+ Vincular Serviço', onClick: () => setServicoDialogOpen(true) } } : {})}
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
                  {verOperacional && (
                  <TabsContent value="operacional" className={TAB_CONTENT_CLASS}>
                    <Card className={MODAL_CARD_CLASS}>
                      <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                        <CardTitle className="text-sm">Competências Recentes</CardTitle>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => navigateTo(`/competencias?clienteId=${clienteId}`)}>
                          Ver todas
                        </Button>
                      </CardHeader>
                      <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                        {falhas.competencias ? (
                          <SecaoIndisponivel falha={falhas.competencias} onRetry={load} />
                        ) : competencias.length === 0 ? (
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

                  )}

                  {/* ── Financeiro ───────────────────────────────── */}
                  {verFinanceiro && (
                  <TabsContent value="financeiro" className={TAB_CONTENT_CLASS}>
                    <Card className={MODAL_CARD_CLASS}>
                      <CardHeader className={MODAL_CARD_HEADER_CLASS}>
                        <CardTitle className="text-sm">Lançamentos Recentes</CardTitle>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => navigateTo(`/financeiro?clienteId=${clienteId}`)}>
                          Ver todos
                        </Button>
                      </CardHeader>
                      <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                        {falhas.lancamentos ? (
                          <SecaoIndisponivel falha={falhas.lancamentos} onRetry={load} />
                        ) : lancamentos.length === 0 ? (
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

                  )}

                  {/* ── Fiscal (config + NFS-e) ───────────────────── */}
                  {verFiscal && (
                  <TabsContent value="fiscal" className={`${TAB_CONTENT_CLASS} space-y-3`}>
                    {(() => {
                      const creds      = (fiscal?.credenciais ?? {}) as Record<string, unknown>
                      const ibge       = fiscal?.municipioIbge as string | undefined
                      const tipo       = ibge ? MUNICIPIO_TIPO[ibge] : undefined
                      const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? nomeMunicipio(ibge) ?? ibge ?? '—'
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
                              {/* Configurar é admin/fiscal (regras de clientes_fiscal) — e
                                  nunca por cima de uma configuração que não foi lida. */}
                              {podeOperarFiscal && !falhas.fiscal && (
                                <Button size="sm" variant="outline" className="h-8" onClick={() => setConfigOpen(true)}>
                                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                  {fiscal ? 'Editar' : 'Configurar'}
                                </Button>
                              )}
                            </CardHeader>
                            <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                              {falhas.fiscal ? (
                                <SecaoIndisponivel falha={falhas.fiscal} onRetry={load} />
                              ) : !fiscal ? (
                                <EmptyState
                                  title="Sem configuração fiscal"
                                  description={podeOperarFiscal ? 'Configure o município e as credenciais para emitir NFS-e.' : 'A equipe fiscal ainda não configurou a emissão deste cliente.'}
                                  {...(podeOperarFiscal ? { action: { label: 'Configurar NFS-e', onClick: () => setConfigOpen(true) } } : {})}
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
                          {fiscal && exigeCertificadoA1(fiscal.provedorNfse, tipo) && (
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
                                {podeOperarFiscal ? (
                                  <CertificadoUpload clienteId={clienteId} certInfo={certInfo} onUploaded={() => { void syncClienteAfterMutation() }} />
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {certInfo
                                      ? `${certInfo.titular}${certInfo.vencimento ? ` · válido até ${certInfo.vencimento}` : ''}`
                                      : 'Certificado ainda não enviado.'}
                                  </p>
                                )}
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
                              {fiscal && podeOperarFiscal && (
                                <Button size="sm" className="h-8" onClick={() => setEmitirOpen(true)}>
                                  + Emitir
                                </Button>
                              )}
                            </CardHeader>
                            <CardContent className={MODAL_CARD_CONTENT_CLASS}>
                              {falhas.nfses ? (
                                <SecaoIndisponivel falha={falhas.nfses} onRetry={load} />
                              ) : nfses.length === 0 ? (
                                <EmptyState
                                  icon={Receipt}
                                  title="Nenhuma NFS-e emitida"
                                  {...(fiscal && podeOperarFiscal ? { action: { label: 'Emitir NFS-e', onClick: () => setEmitirOpen(true) } } : {})}
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
                  )}
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
          defaultValues={defaultsDaConfigFiscal(fiscal as Record<string, unknown> | null | undefined)}
          onSaved={() => { void syncClienteAfterMutation() }}
        />
        <EmitirNfseModal
          open={podeOperarFiscal && emitirOpen}
          onOpenChange={setEmitirOpen}
          clienteId={clienteId}
          onFinished={async () => {
            setEmitirOpen(false)
            await syncClienteAfterMutation()
          }}
        />
    </AppModal>
  )
}
