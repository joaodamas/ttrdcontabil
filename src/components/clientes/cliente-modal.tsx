'use client'

import { useState, useEffect, useCallback } from 'react'
import { Timestamp, where, orderBy, limit } from 'firebase/firestore'
import Link from 'next/link'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatCpfCnpj, formatDate, formatCurrency, formatMesAno } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Mail, MapPin, Phone, FileText, DollarSign, Pencil, Settings, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo:    { label: 'Ativo',    variant: 'default' },
  inativo:  { label: 'Inativo', variant: 'secondary' },
  suspenso: { label: 'Suspenso', variant: 'destructive' },
}

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento',
}

const NFSE_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida:                { label: 'Emitida',   variant: 'default' },
  pendente_processamento: { label: 'Pendente',  variant: 'outline' },
  aguardando_emissao:     { label: 'Rascunho',  variant: 'outline' },
  rejeitada:              { label: 'Rejeitada', variant: 'destructive' },
  cancelada:              { label: 'Cancelada', variant: 'secondary' },
  erro_integracao:        { label: 'Erro',      variant: 'destructive' },
}

interface ClienteModalProps {
  clienteId: string
  clienteNome: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClienteModal({ clienteId, clienteNome, open, onOpenChange }: ClienteModalProps) {
  const [loading,    setLoading]    = useState(false)
  const [cliente,    setCliente]    = useState<Record<string, unknown> | null>(null)
  const [servicos,   setServicos]   = useState<Array<Record<string, unknown>>>([])
  const [competencias,setCompetencias]= useState<Array<Record<string, unknown>>>([])
  const [lancamentos,setLancamentos]= useState<Array<Record<string, unknown>>>([])
  const [nfses,      setNfses]      = useState<Array<Record<string, unknown>>>([])
  const [fiscal,     setFiscal]     = useState<Record<string, unknown> | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(() => {
    if (!clienteId) return
    setLoading(true)

    Promise.allSettled([
      getDocument('clientes', clienteId),
      listDocuments('clientes_servicos', [where('clienteId', '==', clienteId), orderBy('dataInicio', 'desc')]),
      listDocuments('competencias', [where('clienteId', '==', clienteId), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(12)]),
      listDocuments('lancamentos', [where('clienteId', '==', clienteId), orderBy('dataVencimento', 'desc'), limit(10)]),
      listDocuments('nfse_emitidas', [where('clienteId', '==', clienteId), orderBy('criadoEm', 'desc'), limit(20)]),
      listDocuments('nfse_rascunhos', [where('clienteId', '==', clienteId), limit(20)]),
      listDocuments('clientes_fiscal', [where('clienteId', '==', clienteId), limit(1)]),
    ]).then(([clienteR, servicosR, competenciasR, lancamentosR, nfseEmitR, nfseRascR, fiscalR]) => {
      if (clienteR.status === 'fulfilled') setCliente(clienteR.value as Record<string, unknown>)
      if (servicosR.status === 'fulfilled') setServicos(servicosR.value as Array<Record<string, unknown>>)
      if (competenciasR.status === 'fulfilled') setCompetencias(competenciasR.value as Array<Record<string, unknown>>)
      if (lancamentosR.status === 'fulfilled') setLancamentos(lancamentosR.value as Array<Record<string, unknown>>)
      if (fiscalR.status === 'fulfilled') {
        const fd = fiscalR.value as Array<Record<string, unknown>>
        setFiscal(fd.length > 0 ? fd[0] : null)
      }

      const emitidas  = nfseEmitR.status === 'fulfilled' ? nfseEmitR.value as Array<Record<string, unknown>> : []
      const rascunhos = nfseRascR.status === 'fulfilled'
        ? (nfseRascR.value as Array<Record<string, unknown>>).map((r) => ({ ...r, status: 'aguardando_emissao', _origem: 'rascunho' }))
        : []
      setNfses([...rascunhos, ...emitidas])
    }).finally(() => setLoading(false))
  }, [clienteId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const statusInfo = cliente
    ? STATUS_LABELS[cliente.status as string] ?? { label: String(cliente.status), variant: 'outline' as const }
    : null

  // Total monthly value from active services
  const valorMensalAtivo = servicos
    .filter((s) => s.status === 'ativo')
    .reduce((acc, s) => acc + ((s.valor as number) ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="w-full max-h-[88vh] flex flex-col overflow-hidden p-0"
        style={{ maxWidth: '720px' }}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-semibold">
                  {cliente ? (cliente.razaoSocial as string) : clienteNome}
                </DialogTitle>
                {statusInfo ? (
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                ) : null}
              </div>
              {cliente?.nomeFantasia ? (
                <p className="text-xs text-muted-foreground mt-0.5">{cliente.nomeFantasia as string}</p>
              ) : null}
            </div>
            <Link href={`/clientes/${clienteId}/editar`} tabIndex={-1}>
              <Button size="sm" variant="outline" className="shrink-0 mt-0.5">
                Editar
              </Button>
            </Link>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !cliente ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Não foi possível carregar os dados do cliente.
            </p>
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
                    <dt className="text-xs text-muted-foreground">Regime Tributário</dt>
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
                  {/* Valor mensal highlight */}
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Valor Mensal</dt>
                    <dd className={`text-base font-bold mt-0.5 ${valorMensalAtivo > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {valorMensalAtivo > 0 ? formatCurrency(valorMensalAtivo) : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Tabs */}
              <div className="px-5 py-4">
                <Tabs defaultValue="servicos">
                  <TabsList>
                    <TabsTrigger value="servicos">Serviços ({servicos.length})</TabsTrigger>
                    <TabsTrigger value="competencias">Competências ({competencias.length})</TabsTrigger>
                    <TabsTrigger value="financeiro">Financeiro ({lancamentos.length})</TabsTrigger>
                    <TabsTrigger value="nfse">
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      NFS-e ({nfses.length})
                    </TabsTrigger>
                    <TabsTrigger value="fiscal">
                      <Settings className="h-3.5 w-3.5 mr-1" />
                      Fiscal
                    </TabsTrigger>
                  </TabsList>

                  {/* Serviços */}
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
                          <p className="text-sm text-muted-foreground">Nenhum serviço vinculado.</p>
                        ) : (
                          <div className="divide-y">
                            {servicos.map((s) => (
                              <div key={s.id as string} className="py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium">{s.servicoNome as string}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {s.dataInicio ? `Desde ${formatDate((s.dataInicio as Timestamp).toDate())}` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold">{formatCurrency((s.valor as number) ?? 0)}</span>
                                  <Badge variant={s.status === 'ativo' ? 'default' : 'secondary'}>
                                    {s.status as string}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {servicos.length > 0 && (
                          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                            <span className="text-muted-foreground">Total mensal (serviços ativos)</span>
                            <span className="font-bold text-primary">{formatCurrency(valorMensalAtivo)}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Competências */}
                  <TabsContent value="competencias" className="mt-3">
                    <Card>
                      <CardContent className="pt-4">
                        {competencias.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma competência.</p>
                        ) : (
                          <div className="divide-y">
                            {competencias.map((c) => (
                              <div key={c.id as string} className="py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium">{formatMesAno(c.mes as number, c.ano as number)}</p>
                                  {c.servicoNome ? (
                                    <p className="text-xs text-muted-foreground">{c.servicoNome as string}</p>
                                  ) : null}
                                </div>
                                <Badge variant="outline">{c.status as string}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Financeiro */}
                  <TabsContent value="financeiro" className="mt-3">
                    <Card>
                      <CardContent className="pt-4">
                        {lancamentos.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
                        ) : (
                          <div className="divide-y">
                            {lancamentos.map((l) => (
                              <div key={l.id as string} className="py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium">{l.descricao as string}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Venc.: {l.dataVencimento ? formatDate((l.dataVencimento as Timestamp).toDate()) : '—'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold">{formatCurrency((l.valor as number) ?? 0)}</p>
                                  <Badge variant={l.status === 'pago' ? 'default' : l.status === 'cancelado' ? 'secondary' : 'outline'}>
                                    {l.status as string}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Fiscal */}
                  <TabsContent value="fiscal" className="mt-3 space-y-4">
                    {(() => {
                      const creds = (fiscal?.credenciais ?? {}) as Record<string, unknown>
                      const ibge  = fiscal?.municipioIbge as string | undefined
                      const tipo  = ibge ? MUNICIPIO_TIPO[ibge] : undefined
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
                                  <p className="text-sm text-muted-foreground">Nenhuma configuração fiscal cadastrada.</p>
                                  <Button size="sm" onClick={() => setConfigOpen(true)}>Configurar NFS-e</Button>
                                </div>
                              ) : (
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
                                  clienteId={clienteId}
                                  certInfo={certInfo}
                                  onUploaded={() => load()}
                                />
                              </CardContent>
                            </Card>
                          )}

                          {fiscal && (
                            <div className="flex justify-end">
                              <Link href={`/fiscal/emitir?clienteId=${clienteId}`}>
                                <Button size="sm">+ Emitir NFS-e</Button>
                              </Link>
                            </div>
                          )}

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
                        </>
                      )
                    })()}
                  </TabsContent>

                  {/* NFS-e */}
                  <TabsContent value="nfse" className="mt-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-sm">Histórico NFS-e</CardTitle>
                        <Link href={`/fiscal/emitir?clienteId=${clienteId}`}>
                          <Button size="sm">+ Emitir</Button>
                        </Link>
                      </CardHeader>
                      <CardContent>
                        {nfses.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma NFS-e emitida.</p>
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
                              {nfses.map((n) => {
                                const st = NFSE_STATUS_MAP[n.status as string] ?? { label: n.status as string, variant: 'outline' as const }
                                const dataEmissao = n.dataEmissao as Timestamp | undefined
                                return (
                                  <tr key={n.id as string} className="hover:bg-muted/30">
                                    <td className="py-2.5 font-mono text-xs">{(n.numeroNfse as string) ?? '—'}</td>
                                    <td className="py-2.5 text-muted-foreground">{dataEmissao ? formatDate(dataEmissao.toDate()) : '—'}</td>
                                    <td className="py-2.5 text-right font-medium">{formatCurrency((n.valorServico as number) ?? 0)}</td>
                                    <td className="py-2.5 pl-4"><Badge variant={st.variant}>{st.label}</Badge></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </CardContent>
                    </Card>
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
