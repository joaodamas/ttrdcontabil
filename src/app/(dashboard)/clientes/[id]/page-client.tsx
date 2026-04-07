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
import { ArrowLeft, Mail, MapPin, Loader2 } from 'lucide-react'

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

  const [cliente, setCliente] = useState<Record<string, unknown> | null>(null)
  const [servicos, setServicos] = useState<Array<Record<string, unknown>>>([])
  const [competencias, setCompetencias] = useState<Array<Record<string, unknown>>>([])
  const [lancamentos, setLancamentos] = useState<Array<Record<string, unknown>>>([])
  const [fiscal, setFiscal] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getDocument('clientes', id),
      listDocuments('clientes_servicos', [where('clienteId', '==', id), orderBy('dataInicio', 'desc')]),
      listDocuments('competencias', [where('clienteId', '==', id), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)]),
      listDocuments('lancamentos', [where('clienteId', '==', id), orderBy('dataVencimento', 'desc'), limit(20)]),
      listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)]),
    ]).then(([clienteData, servicosData, competenciasData, lancamentosData, fiscalData]) => {
      if (!clienteData) {
        router.push('/clientes')
        return
      }
      setCliente(clienteData as Record<string, unknown>)
      setServicos(servicosData as Array<Record<string, unknown>>)
      setCompetencias(competenciasData as Array<Record<string, unknown>>)
      setLancamentos(lancamentosData as Array<Record<string, unknown>>)
      setFiscal(fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
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
        <TabsContent value="fiscal" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Dados Fiscais</CardTitle>
              <Link href={`/clientes/${id}/fiscal`}>
                <Button size="sm" variant="outline">
                  {fiscal ? 'Editar' : 'Configurar'}
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {!fiscal ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma configuração fiscal cadastrada.
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Município Emissor</dt>
                    <dd className="font-medium">{fiscal.municipioEmissor as string}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">UF</dt>
                    <dd className="font-medium">{fiscal.uf as string}</dd>
                  </div>
                  {fiscal.inscricaoMunicipal ? (
                    <div>
                      <dt className="text-muted-foreground text-xs">Inscrição Municipal</dt>
                      <dd className="font-medium">{fiscal.inscricaoMunicipal as string}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground text-xs">Tipo Integração</dt>
                    <dd className="font-medium">{fiscal.tipoIntegracaoNfse as string}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Ambiente</dt>
                    <dd className="font-medium">{fiscal.ambienteEmissao as string}</dd>
                  </div>
                  {fiscal.aliquotaPadrao ? (
                    <div>
                      <dt className="text-muted-foreground text-xs">Alíquota Padrão</dt>
                      <dd className="font-medium">{fiscal.aliquotaPadrao as number}%</dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
