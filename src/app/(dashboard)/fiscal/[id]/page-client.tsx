'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { orderBy, Timestamp, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { Check, Copy, ExternalLink, FileCode, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { NfseStatusBadge } from '@/components/ui/status-badge'
import { RecordUnavailable } from '@/components/ui/record-unavailable'
import { getErrorMessage } from '@/lib/error-message'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { getDocument, listDocuments } from '@/lib/firestore-client'
import { getFirebaseApp } from '@/lib/firebase'
import { formatCurrency, formatDate, tsToDate } from '@/lib/utils'
import { useNfseArquivos } from '@/components/fiscal/use-nfse-arquivos'
import {
  chaveAcessoDaNota,
  podeObterDanfse,
  temXmlNfse,
  urlConsultaPublicaNfse,
} from '@/features/fiscal/nfse-arquivos'

export default function NfseDetalhePage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [nota, setNota] = useState<Record<string, unknown> | null>(null)
  const [eventos, setEventos] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [cancelamentoOpen, setCancelamentoOpen] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [chaveCopiada, setChaveCopiada] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErroCarga(null)
    try {
      const [notaData, eventosData] = await Promise.all([
        getDocument<Record<string, unknown>>('nfse_emitidas', id),
        listDocuments<Record<string, unknown>>('nfse_eventos', [
          where('nfseId', '==', id),
          orderBy('criadoEm', 'desc'),
        ]).catch(() => []),
      ])
      setNota(notaData)
      setEventos(eventosData)
    } catch (err) {
      console.error('[fiscal/detalhe] falha ao carregar', err)
      setNota(null)
      setErroCarga(getErrorMessage(err, 'Verifique sua conexão e tente novamente.'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Sem recarregar a página ao gerar o PDF: o callable reaproveita o arquivo já salvo.
  const { baixarXml, abrirDanfse, gerandoPdfId } = useNfseArquivos()

  async function copiarChave(chave: string) {
    try {
      await navigator.clipboard.writeText(chave)
      setChaveCopiada(true)
      toast.success('Chave de acesso copiada.')
      setTimeout(() => setChaveCopiada(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione a chave e copie manualmente.')
    }
  }

  async function consultarStatus() {
    try {
      const fn = httpsCallable<{ nfseId: string }, { message: string }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'consultarNfse'
      )
      const { data } = await fn({ nfseId: id })
      toast.success(data.message)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao consultar NFS-e.')
    }
  }

  async function solicitarCancelamento() {
    const motivo = motivoCancelamento.trim()
    if (motivo.length < 10) {
      toast.error('Informe um motivo com pelo menos 10 caracteres.')
      return
    }
    setCancelando(true)
    try {
      const fn = httpsCallable<{ nfseId: string; motivo: string }, { message: string }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'cancelarNfse'
      )
      const { data } = await fn({ nfseId: id, motivo })
      toast.success(data.message)
      setCancelamentoOpen(false)
      setMotivoCancelamento('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar NFS-e.')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!nota) {
    return (
      <RecordUnavailable
        reason={erroCarga ? 'erro' : 'nao_encontrado'}
        notFoundTitle="NFS-e não encontrada"
        errorTitle="Não foi possível carregar a NFS-e"
        errorDescription={erroCarga ?? undefined}
        backHref="/fiscal/historico"
        backLabel="Voltar para o histórico"
        onRetry={() => { void load() }}
      />
    )
  }

  const dataEmissao = nota.dataEmissao as Timestamp | undefined
  const chaveAcesso = chaveAcessoDaNota(nota)
  const gerandoPdf = gerandoPdfId === id

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Histórico de NFS-e', href: '/fiscal/historico' },
          { label: `NFS-e ${(nota.numeroNfse as string) ?? 'sem número'}` },
        ]}
        title={`NFS-e ${(nota.numeroNfse as string) ?? 'sem número'}`}
        description={(nota.clienteNome as string) ?? 'Cliente não informado'}
        action={
          <>
            <Button variant="outline" size="cta" onClick={consultarStatus}>
              <RefreshCw />
              Consultar
            </Button>
            {temXmlNfse(nota) ? (
              <Button variant="outline" size="cta" onClick={() => baixarXml(nota)}>
                <FileCode />
                Baixar XML
              </Button>
            ) : null}
            {podeObterDanfse(nota) ? (
              <Button
                variant="outline"
                size="cta"
                onClick={() => { void abrirDanfse(nota) }}
                disabled={gerandoPdf}
                aria-busy={gerandoPdf}
              >
                {gerandoPdf ? <Loader2 className="animate-spin" /> : <FileText />}
                {gerandoPdf ? 'Gerando PDF…' : 'Baixar PDF (DANFSe)'}
              </Button>
            ) : null}
            {nota.status === 'emitida' ? (
              <Button variant="outline" size="cta" className="text-destructive" onClick={() => setCancelamentoOpen(true)}>
                <XCircle />
                Cancelar
              </Button>
            ) : null}
          </>
        }
      />

      {chaveAcesso ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">Chave de acesso</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wide sm:text-base">
                {chaveAcesso}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void copiarChave(chaveAcesso) }}
                aria-label="Copiar chave de acesso"
              >
                {chaveCopiada ? <Check /> : <Copy />}
                {chaveCopiada ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
            <a
              href={urlConsultaPublicaNfse(chaveAcesso)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'link', size: 'sm', className: 'h-auto px-0' })}
            >
              <ExternalLink />
              Consultar no portal nacional
            </a>
            <p className="text-xs text-muted-foreground">
              Abre a consulta pública oficial (nfse.gov.br) já com esta chave. Se o portal pedir, cole a chave copiada acima.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <NfseStatusBadge status={nota.status as string} />
            <p className="text-muted-foreground">Emissão: {dataEmissao ? formatDate(tsToDate(dataEmissao)) : '—'}</p>
            <p className="text-muted-foreground">Código: {(nota.codigoVerificacao as string) ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Tomador</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{(nota.tomadorNome as string) ?? '—'}</p>
            <p className="text-muted-foreground">{(nota.tomadorCpfCnpj as string) ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Serviço</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{formatCurrency(nota.valorServico as number)}</p>
            <p className="text-muted-foreground">{(nota.codigoServico as string) ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {nota.erroUltimaTentativa || nota.motivoCancelamento ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">Tratamento operacional</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {nota.erroUltimaTentativa ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Erro da última tentativa</p>
                <p className="mt-1 text-destructive">{nota.erroUltimaTentativa as string}</p>
              </div>
            ) : null}
            {nota.codigoErroUltimaTentativa ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Código técnico</p>
                <p className="mt-1 font-mono">{nota.codigoErroUltimaTentativa as string}</p>
              </div>
            ) : null}
            {nota.detalhesUltimaTentativa ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Detalhes técnicos</p>
                <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {String(nota.detalhesUltimaTentativa)}
                </pre>
              </div>
            ) : null}
            {nota.requestResumoUltimaTentativa ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Resumo do request</p>
                <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify(nota.requestResumoUltimaTentativa as Record<string, unknown>, null, 2)}
                </pre>
              </div>
            ) : null}
            {nota.motivoCancelamento ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Motivo de cancelamento</p>
                <p className="mt-1">{nota.motivoCancelamento as string}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {nota.xmlNfse ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">XML</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
              {nota.xmlNfse as string}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-sm">Auditoria</CardTitle></CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            <div className="divide-y text-sm">
              {eventos.map((e) => {
                const criadoEm = e.criadoEm as Timestamp | undefined
                const criadoEmDate = tsToDate(criadoEm)
                return (
                  <div key={e.id as string} className="py-3">
                    <p className="font-medium">{(e.mensagem as string) ?? (e.tipo as string)}</p>
                    <p className="text-xs text-muted-foreground">
                      {criadoEmDate ? criadoEmDate.toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelamentoOpen} onOpenChange={setCancelamentoOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Solicitar cancelamento</DialogTitle>
            <DialogDescription>
              A solicitação será registrada com auditoria e ficará pendente de processamento fiscal.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoCancelamento}
            onChange={(event) => setMotivoCancelamento(event.target.value)}
            placeholder="Informe o motivo fiscal do cancelamento"
            className="min-h-28"
          />
          <DialogFooter className="flex-row justify-end border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => setCancelamentoOpen(false)} disabled={cancelando}>
              Cancelar
            </Button>
            <Button type="button" onClick={solicitarCancelamento} disabled={cancelando}>
              {cancelando ? 'Registrando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
