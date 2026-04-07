export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  mei: 'MEI',
  isento: 'Isento',
}

export default async function ClienteFiscalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params

  const clienteDoc = await adminDb.collection('clientes').doc(id).get()
  if (!clienteDoc.exists) notFound()

  const cliente = { id: clienteDoc.id, ...clienteDoc.data() } as Record<string, unknown>

  // Fetch fiscal info
  const fiscalSnap = await adminDb
    .collection('clientes_fiscal')
    .where('clienteId', '==', id)
    .limit(1)
    .get()

  const fiscal = fiscalSnap.empty
    ? null
    : ({ id: fiscalSnap.docs[0].id, ...fiscalSnap.docs[0].data() } as Record<string, unknown>)

  // Recent NFS-e
  const nfseSnap = await adminDb
    .collection('nfse_emitidas')
    .where('clienteId', '==', id)
    .orderBy('criadoEm', 'desc')
    .limit(10)
    .get()

  const notas = nfseSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
    Record<string, unknown>
  >

  const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    emitida: { label: 'Emitida', variant: 'default' },
    cancelada: { label: 'Cancelada', variant: 'destructive' },
    pendente_processamento: { label: 'Pendente', variant: 'outline' },
    erro: { label: 'Erro', variant: 'destructive' },
  }

  return (
    <div className="space-y-5">
      {/* Header */}
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

      {/* Dados Fiscais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Dados Fiscais</CardTitle>
          <Link href={`/fiscal/emitir?clienteId=${id}`}>
            <Button size="sm">Emitir NFS-e</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {!fiscal ? (
            <p className="text-sm text-muted-foreground">
              Nenhum dado fiscal cadastrado para este cliente.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Regime Tributário</dt>
                <dd className="font-medium">
                  {REGIME_LABELS[fiscal.regimeTributario as string] ??
                    (fiscal.regimeTributario as string) ??
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inscrição Municipal</dt>
                <dd className="font-medium">{(fiscal.inscricaoMunicipal as string) ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inscrição Estadual</dt>
                <dd className="font-medium">{(fiscal.inscricaoEstadual as string) ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CNAE Principal</dt>
                <dd className="font-medium">{(fiscal.cnaePrincipal as string) ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Município NFS-e</dt>
                <dd className="font-medium">{(fiscal.municipioNfse as string) ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Código Serviço Padrão</dt>
                <dd className="font-medium">{(fiscal.codigoServicoPadrao as string) ?? '—'}</dd>
              </div>
              {fiscal.aliquotaIss != null ? (
                <div>
                  <dt className="text-muted-foreground">Alíquota ISS</dt>
                  <dd className="font-medium">{fiscal.aliquotaIss as number}%</dd>
                </div>
              ) : null}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* NFS-e Emitidas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">NFS-e Emitidas (últimas 10)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {notas.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Nenhuma NFS-e emitida para este cliente.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Tomador
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Valor</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {notas.map((n) => {
                  const st = STATUS_MAP[n.status as string] ?? {
                    label: n.status as string,
                    variant: 'outline' as const,
                  }
                  return (
                    <tr key={n.id as string}>
                      <td className="px-4 py-2">{(n.tomadorNome as string) ?? '—'}</td>
                      <td className="px-4 py-2">
                        {n.valorServico != null
                          ? Number(n.valorServico).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })
                          : '—'}
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
    </div>
  )
}
