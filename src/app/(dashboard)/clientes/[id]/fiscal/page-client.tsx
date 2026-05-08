'use client'

import { useCallback, useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, limit, Timestamp } from 'firebase/firestore'

import { getDocument, listDocuments } from '@/lib/firestore-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Pencil, Plus, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { getPathSegmentAfter } from '@/lib/route-params'

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento / Imune',
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  emitida:                 { label: 'Emitida',    variant: 'default' },
  cancelada:               { label: 'Cancelada',  variant: 'destructive' },
  pendente_processamento:  { label: 'Pendente',   variant: 'outline' },
  erro_integracao:         { label: 'Erro',       variant: 'destructive' },
  rejeitada:               { label: 'Rejeitada',  variant: 'destructive' },
}

export default function ClienteFiscalPage() {
  const pathname = usePathname()
  const id = getPathSegmentAfter(pathname, 'clientes')
  const router  = useRouter()

  const [cliente,   setCliente]   = useState<Record<string, unknown> | null>(null)
  const [fiscal,    setFiscal]    = useState<Record<string, unknown> | null>(null)
  const [notas,     setNotas]     = useState<Array<Record<string, unknown>>>([])
  const [loading,   setLoading]   = useState(true)
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getDocument('clientes', id),
      listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)]),
      listDocuments('nfse_emitidas', [where('clienteId', '==', id), orderBy('dataEmissao', 'desc'), limit(10)]),
    ]).then(([clienteData, fiscalData, notasData]) => {
      if (!clienteData) { router.push('/clientes'); return }
      setCliente(clienteData as Record<string, unknown>)
      setFiscal(fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
      setNotas(notasData as Array<Record<string, unknown>>)
    }).finally(() => setLoading(false))
  }, [id, router])

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

  if (!cliente) return null

  const creds       = (fiscal?.credenciais ?? {}) as Record<string, unknown>
  const ibge        = fiscal?.municipioIbge as string | undefined
  const tipo        = ibge ? MUNICIPIO_TIPO[ibge] : undefined
  const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? (ibge ?? '—')

  const certInfo: CertInfo | null = creds.certTitular
    ? {
        titular:     creds.certTitular as string,
        vencimento:  creds.certVencimento as string,
        valido:      creds.certValido as boolean,
        storagePath: creds.certificadoStoragePath as string,
      }
    : null

  const fiscalDefaults = fiscal
    ? {
        municipioIbge:       fiscal.municipioIbge       as string,
        inscricaoMunicipal:  fiscal.inscricaoMunicipal  as string,
        inscricaoEstadual:   fiscal.inscricaoEstadual   as string,
        ambienteEmissao:     (fiscal.ambienteEmissao    as 'homologacao' | 'producao') ?? 'homologacao',
        regimeTributario:    fiscal.regimeTributario    as string,
        optanteSimples:      (fiscal.optanteSimples     as boolean) ?? true,
        incentivadorCultural:(fiscal.incentivadorCultural as boolean) ?? false,
        naturezaOperacao:    (fiscal.naturezaOperacao   as string) ?? '1',
        codigoServicoPadrao: fiscal.codigoServicoPadrao as string,
        descricaoServicoPadrao: fiscal.descricaoServicoPadrao as string,
        itemListaServico:    fiscal.itemListaServico    as string,
        cnae:                fiscal.cnae                as string,
        aliquotaPadrao:      fiscal.aliquotaPadrao      as number,
        issRetidoPadrao:     (fiscal.issRetidoPadrao    as boolean) ?? false,
        credenciais:         creds,
      }
    : undefined

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/clientes/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
          </Link>
          <div>
            <h2 className="text-lg font-semibold">Fiscal — {cliente.razaoSocial as string}</h2>
            <p className="text-sm text-muted-foreground">Configurações fiscais e NFS-e emitidas</p>
          </div>
        </div>
        <Link href={`/fiscal/emitir?clienteId=${id}`}>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Emitir NFS-e
          </Button>
        </Link>
      </div>

      {/* Dados Fiscais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Dados Fiscais</CardTitle>
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
                  {fiscal.ambienteEmissao === 'producao'
                    ? <Badge variant="default" className="text-xs">Produção</Badge>
                    : <Badge variant="secondary" className="text-xs">Homologação</Badge>
                  }
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

      {/* Certificado A1 — só para municípios ABRASF */}
      {fiscal && (tipo === 'abrasf_a1' || tipo === 'geisweb_a1') && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            {certInfo
              ? certInfo.valido
                ? <ShieldCheck className="w-4 h-4 text-success" />
                : <ShieldAlert className="w-4 h-4 text-destructive" />
              : <ShieldOff className="w-4 h-4 text-muted-foreground" />
            }
            <CardTitle className="text-sm">Certificado Digital A1</CardTitle>
          </CardHeader>
          <CardContent>
            <CertificadoUpload
              clienteId={id}
              certInfo={certInfo}
              onUploaded={() => load()}
            />
          </CardContent>
        </Card>
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
                  const st = STATUS_MAP[n.status as string] ?? { label: n.status as string, variant: 'outline' as const }
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
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Config Form Dialog */}
      <ConfigFiscalForm
        open={configOpen}
        onOpenChange={setConfigOpen}
        clienteId={id}
        docId={fiscal?.id as string | undefined}
        defaultValues={fiscalDefaults}
        onSaved={load}
      />
    </div>
  )
}
