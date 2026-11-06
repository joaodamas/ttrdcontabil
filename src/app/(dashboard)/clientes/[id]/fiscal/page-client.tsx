'use client'

import { useCallback, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/page-header'
import { AmbienteBadge, NfseStatusBadge } from '@/components/ui/status-badge'
import { RecordUnavailable, type RecordLoadFailure } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Pencil, Plus, AlertTriangle, Package, Truck } from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO, defaultsDaConfigFiscal } from '@/components/fiscal/config-fiscal-form'
import { exigeCertificadoA1, nomeMunicipio } from '@/lib/nfse-dominios'
import { CertificadoStatusCard } from '@/components/fiscal/certificado-status-card'
import { useAuth } from '@/contexts/auth-context'
import { podeOperarNfse } from '@/lib/permissions'
import { EmitirNfseModal } from '@/components/fiscal/emitir-nfse-modal'
import { getPathSegmentAfter } from '@/lib/route-params'

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento / Imune',
}

export default function ClienteFiscalPage() {
  const pathname = usePathname()
  const id = getPathSegmentAfter(pathname, 'clientes')
  const { usuario } = useAuth()

  const [cliente,   setCliente]   = useState<Record<string, unknown> | null>(null)
  const [fiscal,    setFiscal]    = useState<Record<string, unknown> | null>(null)
  const [notas,     setNotas]     = useState<Array<Record<string, unknown>>>([])
  const [loading,   setLoading]   = useState(true)
  const [falha,     setFalha]     = useState<{ reason: RecordLoadFailure; message?: string } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [emitirOpen, setEmitirOpen] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    setFalha(null)
    Promise.all([
      getDocument('clientes', id),
      // Financeiro não lê clientes_fiscal (regras, M1): segue mostrando as notas.
      listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)]).catch(() => []),
      listDocuments('nfse_emitidas', [where('clienteId', '==', id), orderBy('dataEmissao', 'desc'), limit(10)]),
    ]).then(([clienteData, fiscalData, notasData]) => {
      if (!clienteData) { setCliente(null); setFalha({ reason: 'nao_encontrado' }); return }
      setCliente(clienteData as Record<string, unknown>)
      setFiscal(fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
      setNotas(notasData as Array<Record<string, unknown>>)
    }).catch((err: unknown) => {
      console.error('[clientes/fiscal] falha ao carregar', err)
      setCliente(null)
      setFalha({ reason: 'erro', message: getErrorMessage(err, 'Verifique sua conexão e tente novamente.') })
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    queueMicrotask(() => { void load() })
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!cliente) {
    return (
      <RecordUnavailable
        reason={falha?.reason ?? 'nao_encontrado'}
        notFoundTitle="Cliente não encontrado"
        errorTitle="Não foi possível carregar os dados fiscais do cliente"
        errorDescription={falha?.message}
        backHref={falha?.reason === 'erro' && id ? `/clientes/${id}` : '/clientes'}
        backLabel={falha?.reason === 'erro' && id ? 'Voltar para o cliente' : 'Voltar para clientes'}
        onRetry={load}
      />
    )
  }

  // Ver mesma lógica em ../page-client.tsx: categoriaFiscal vem do CNAE
  // (scripts/classificar-clientes-fiscal.mjs) e decide NFS-e × NF-e × CT-e.
  const categoriaFiscal = (cliente.categoriaFiscal as string) ?? 'servico'
  const creds       = (fiscal?.credenciais ?? {}) as Record<string, unknown>
  const ibge        = fiscal?.municipioIbge as string | undefined
  const tipo        = ibge ? MUNICIPIO_TIPO[ibge] : undefined
  const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? nomeMunicipio(ibge) ?? (ibge ?? '—')

  const fiscalDefaults = defaultsDaConfigFiscal(fiscal)

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.razaoSocial as string, href: `/clientes/${id}` },
          { label: 'Fiscal' },
        ]}
        title={`Fiscal — ${cliente.razaoSocial as string}`}
        description={
          categoriaFiscal === 'produto' ? 'NF-e — emitida fora da plataforma'
            : categoriaFiscal === 'transporte' ? 'CT-e — autoemitido fora da plataforma'
            : 'Configurações fiscais e NFS-e emitidas'
        }
        action={
          categoriaFiscal === 'produto' || categoriaFiscal === 'transporte' ? null : (
            <Button size="cta" onClick={() => setEmitirOpen(true)}>
              <Plus />
              Emitir NFS-e
            </Button>
          )
        }
      />

      {categoriaFiscal === 'produto' ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">NF-e (produto)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Este cliente foi classificado pelo CNAE como emissor de <strong>NF-e</strong> (nota fiscal de
              produto/mercadoria). A plataforma não emite NF-e — a emissão é direta, sem integrador, e
              hoje cobre só NFS-e. Este cliente emite a NF-e por fora da plataforma.
            </p>
          </CardContent>
        </Card>
      ) : categoriaFiscal === 'transporte' ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Truck className="w-4 h-4 text-warning" />
            <CardTitle className="text-sm">CT-e (transporte)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Este cliente foi classificado pelo CNAE como emissor de <strong>CT-e</strong> (conhecimento de
              transporte). A plataforma não emite CT-e — este cliente autoemite por fora dela.
            </p>
          </CardContent>
        </Card>
      ) : (
      <>
      {/* Dados Fiscais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Dados Fiscais</CardTitle>
            {fiscal?.emissaoAutomatica === true && (
              <Badge variant="destructive" className="gap-1 text-[10px]" title="Emite sem revisão humana, sozinho, no dia configurado">
                <AlertTriangle className="h-2.5 w-2.5" /> Emissão automática
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            {fiscal ? 'Editar' : 'Configurar'}
          </Button>
        </CardHeader>
        <CardContent>
          {!fiscal ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Nenhuma configuração fiscal cadastrada.
              </p>
              <Button size="sm" onClick={() => setConfigOpen(true)}>
                Configurar agora
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
                <dd className="font-medium">
                  <AmbienteBadge ambiente={fiscal.ambienteEmissao === 'producao' ? 'producao' : 'homologacao'} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Inscrição Municipal</dt>
                <dd className="font-medium">{(fiscal.inscricaoMunicipal as string) ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Regime Tributário</dt>
                <dd className="font-medium">
                  {REGIME_LABELS[fiscal.regimeTributario as string] ?? (fiscal.regimeTributario as string) ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Optante Simples</dt>
                <dd className="font-medium">{fiscal.optanteSimples ? 'Sim' : 'Não'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Alíquota ISS</dt>
                <dd className="font-medium">
                  {fiscal.aliquotaPadrao != null ? `${fiscal.aliquotaPadrao}%` : '—'}
                </dd>
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
              {fiscal.naturezaOperacao ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Natureza Operação</dt>
                  <dd className="font-medium">{fiscal.naturezaOperacao as string}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Certificado A1 — Ambiente Nacional sempre; conector da prefeitura só ABRASF/GeisWeb */}
      {fiscal && exigeCertificadoA1(fiscal.provedorNfse, tipo) && (
        <CertificadoStatusCard
          clienteId={id}
          credenciais={creds}
          cnpjCliente={cliente.cpfCnpj}
          podeEnviar={podeOperarNfse(usuario)}
          onEnviado={load}
        />
      )}

      {/* NFS-e Emitidas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">NFS-e Emitidas (últimas 10)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {notas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nenhuma NFS-e emitida para este cliente.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left section-label">Tomador</th>
                  <th className="px-4 py-2 text-left section-label">Nº NFS-e</th>
                  <th className="px-4 py-2 text-right section-label">Valor</th>
                  <th className="px-4 py-2 text-left section-label">Data</th>
                  <th className="px-4 py-2 text-left section-label">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {notas.map((n) => {
                  const dt = n.dataEmissao instanceof Timestamp ? n.dataEmissao.toDate() : null
                  return (
                    <tr key={n.id as string} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{(n.tomadorNome as string) ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{(n.numeroNfse as string) ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {n.valorServico != null
                          ? Number(n.valorServico).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {dt ? dt.toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <NfseStatusBadge status={n.status as string} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {/* Config Form Dialog */}
      <ConfigFiscalForm
        open={configOpen}
        onOpenChange={setConfigOpen}
        clienteId={id}
        docId={fiscal?.id as string | undefined}
        defaultValues={fiscalDefaults}
        onSaved={load}
      />
      <EmitirNfseModal
        open={emitirOpen}
        onOpenChange={setEmitirOpen}
        clienteId={id}
        onFinished={async () => {
          setEmitirOpen(false)
          load()
        }}
      />
    </div>
  )
}
