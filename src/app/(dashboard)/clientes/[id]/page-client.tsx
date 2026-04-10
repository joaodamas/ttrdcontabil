'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { where, orderBy, limit } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { formatCpfCnpj, formatDate, formatCurrency, formatMesAno } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Mail, MapPin, Loader2, Pencil, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'
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

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [cliente,     setCliente]     = useState<Record<string, unknown> | null>(null)
  const [servicos,    setServicos]    = useState<Array<Record<string, unknown>>>([])
  const [competencias,setCompetencias]= useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [fiscal,      setFiscal]      = useState<Record<string, unknown> | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [configOpen,  setConfigOpen]  = useState(false)

  function loadFiscal() {
    if (!id) return
    listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)])
      .then(data => setFiscal(data.length > 0 ? data[0] as Record<string, unknown> : null))
      .catch(() => null)
  }

  useEffect(() => {
    if (!id) return
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
    ]).then(([clienteData, servicosData, competenciasData, lancamentosData, fiscalData]) => {
      if (!clienteData) {
        router.push('/clientes')
        return
      }
      setCliente(clienteData as Record<string, unknown>)
      setServicos((servicosData ?? []) as Array<Record<string, unknown>>)
      setCompetencias((competenciasData ?? []) as Array<Record<string, unknown>>)
      setLancamentos((lancamentosData ?? []) as Array<Record<string, unknown>>)
      setFiscal(fiscalData && fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
    }).finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!cliente) return null

  const statusInfo = STATUS_LABELS[cliente.status as string] ?? { label: String(cliente.status), variant: 'outline' as const }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clientes">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{cliente.razaoSocial as string}</h2>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          {cliente.nomeFantasia ? (
            <p className="text-sm text-muted-foreground">{cliente.nomeFantasia as string}</p>
          ) : null}
        </div>
        <Link href={`/clientes/${id}/editar`}>
          <Button size="sm" variant="outline">
            Editar
          </Button>
        </Link>
      </div>

      {/* Info geral */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 space-y-1">
            <p className="text-xs text-muted-foreground">CPF / CNPJ</p>
            <p className="font-mono text-sm font-medium">
              {formatCpfCnpj(cliente.cpfCnpj as string)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 space-y-1">
            <p className="text-xs text-muted-foreground">Regime Tributário</p>
            <p className="text-sm font-medium">
              {cliente.regimeTributario
                ? REGIME_LABELS[cliente.regimeTributario as string] ?? String(cliente.regimeTributario)
                : '—'}
            </p>
          </CardContent>
        </Card>
        {cliente.email ? (
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> E-mail
              </p>
              <p className="text-sm font-medium truncate">{cliente.email as string}</p>
            </CardContent>
          </Card>
        ) : null}
        {(cliente.cidade || cliente.uf) ? (
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Localização
              </p>
              <p className="text-sm font-medium">
                {[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="servicos">
        <TabsList>
          <TabsTrigger value="servicos">Serviços ({servicos.length})</TabsTrigger>
          <TabsTrigger value="competencias">Competências ({competencias.length})</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro ({lancamentos.length})</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
        </TabsList>

        {/* Serviços */}
        <TabsContent value="servicos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
              <Link href={`/clientes/${id}/servicos/novo`}>
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
                          {formatCurrency(s.valor as number)} •{' '}
                          {s.dataInicio
                            ? formatDate((s.dataInicio as Timestamp).toDate())
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
        </TabsContent>

        {/* Competências */}
        <TabsContent value="competencias" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Competências</CardTitle>
              <Link href={`/competencias?clienteId=${id}`}>
                <Button size="sm" variant="outline">Ver todas</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {competencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma competência.</p>
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
        </TabsContent>

        {/* Financeiro */}
        <TabsContent value="financeiro" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Lançamentos</CardTitle>
              <Link href={`/financeiro?clienteId=${id}`}>
                <Button size="sm" variant="outline">Ver todos</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {lancamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
              ) : (
                <div className="divide-y">
                  {lancamentos.map((l) => (
                    <div key={l.id as string} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{l.descricao as string}</p>
                        <p className="text-xs text-muted-foreground">
                          Venc.:{' '}
                          {l.dataVencimento
                            ? formatDate((l.dataVencimento as Timestamp).toDate())
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
        </TabsContent>

        {/* Fiscal */}
        <TabsContent value="fiscal" className="mt-4 space-y-4">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
