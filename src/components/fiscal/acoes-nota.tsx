'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { Download, Eye, FileCode, History, Loader2, MoreHorizontal, RefreshCw, XCircle } from 'lucide-react'

import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { podeOperarNfse } from '@/lib/permissions'
import { podeObterDanfse, temXmlNfse } from '@/features/fiscal/nfse-arquivos'
import { useNfseArquivos } from '@/components/fiscal/use-nfse-arquivos'
import { LogsNfseModal } from '@/components/fiscal/logs-nfse-modal'
import { AppModal } from '@/components/ui/app-modal'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PararLinha } from '@/components/ui/linha-clicavel'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Nota = Record<string, unknown>

/** Ambiente Nacional: xMotivo de 15 a 255 caracteres. */
export const MOTIVO_CANCELAMENTO_MIN = 15

async function chamar<T extends Record<string, unknown>>(nome: string, dados: T) {
  const fn = httpsCallable<T, { status: string; message: string }>(
    getFunctions(getFirebaseApp(), 'southamerica-east1'),
    nome,
  )
  const { data } = await fn(dados)
  return data
}

interface AcoesNotaProps {
  nota: Nota
  /** Botões com texto ("PDF", "XML") em vez de só ícone. */
  rotulos?: boolean
  /** Depois de consultar/cancelar (o status da nota pode ter mudado). */
  onAtualizar?: () => void
  className?: string
}

/**
 * Ações de UMA NFS-e — as mesmas no Histórico de NFS-e e na ficha do cliente:
 * PDF (DANFSe, pelo callable obterUrlDanfse) e XML à vista; no menu ⋯ o
 * detalhe, os logs e — só admin/fiscal (podeOperarNfse, espelho das
 * functions) — consultar status e solicitar cancelamento.
 *
 * PDF/XML aparecem sempre: sem arquivo, o botão fica desabilitado e diz por
 * quê (antes sumia, e a nota emitida parecia não ter PDF nenhum).
 * Envolto em PararLinha: clicar aqui não abre a linha da tabela.
 */
export function AcoesNota({ nota, rotulos = false, onAtualizar, className }: AcoesNotaProps) {
  const router = useRouter()
  const { usuario } = useAuth()
  const podeOperar = podeOperarNfse(usuario)
  const { baixarXml, abrirDanfse, gerandoPdfId } = useNfseArquivos()
  const [logsAbertos, setLogsAbertos] = useState(false)
  const [cancelamentoAberto, setCancelamentoAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [cancelando, setCancelando] = useState(false)

  const id = nota.id as string
  const temXml = temXmlNfse(nota)
  const temPdf = podeObterDanfse(nota)
  const gerando = gerandoPdfId === id
  const tamanho = rotulos ? 'h-8 gap-1.5 px-2.5' : 'h-8 w-8 p-0'

  async function consultarStatus() {
    try {
      const data = await chamar('consultarNfse', { nfseId: id })
      toast.success(data.message)
      onAtualizar?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível consultar a NFS-e. Verifique a configuração fiscal do cliente.'))
    }
  }

  async function confirmarCancelamento() {
    const texto = motivo.trim()
    if (texto.length < MOTIVO_CANCELAMENTO_MIN) {
      toast.error(`Informe um motivo com pelo menos ${MOTIVO_CANCELAMENTO_MIN} caracteres.`)
      return
    }
    setCancelando(true)
    try {
      const data = await chamar('cancelarNfse', { nfseId: id, motivo: texto })
      toast.success(data.message)
      setCancelamentoAberto(false)
      setMotivo('')
      onAtualizar?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível solicitar o cancelamento. Verifique o status da nota e a configuração fiscal.'))
    } finally {
      setCancelando(false)
    }
  }

  return (
    <PararLinha className={cn('flex shrink-0 items-center justify-end gap-1.5', className)}>
      <Button
        variant="outline"
        size="sm"
        className={tamanho}
        title={temPdf ? (gerando ? 'Gerando PDF (DANFSe)…' : 'Baixar PDF (DANFSe)') : 'PDF indisponível: a nota não tem o XML oficial gravado'}
        aria-label="Baixar PDF (DANFSe)"
        aria-busy={gerando}
        disabled={!temPdf || gerando}
        onClick={() => { void abrirDanfse(nota) }}
      >
        {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {rotulos ? <span>PDF</span> : null}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={tamanho}
        title={temXml ? 'Baixar XML' : 'XML indisponível: a nota não tem o XML oficial gravado'}
        aria-label="Baixar XML"
        disabled={!temXml}
        onClick={() => baixarXml(nota)}
      >
        <FileCode className="h-3.5 w-3.5" />
        {rotulos ? <span>XML</span> : null}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 w-8 p-0' })}
          aria-label="Mais ações"
          title="Mais ações"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => router.push(`/fiscal/${id}`)}>
            <Eye className="h-3.5 w-3.5 mr-2" />Ver detalhe
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLogsAbertos(true)}>
            <History className="h-3.5 w-3.5 mr-2" />Ver logs de emissão
          </DropdownMenuItem>
          {podeOperar ? (
            <DropdownMenuItem onClick={() => { void consultarStatus() }}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />Consultar status
            </DropdownMenuItem>
          ) : null}
          {podeOperar && nota.status === 'emitida' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setMotivo(''); setCancelamentoAberto(true) }}>
                <XCircle className="h-3.5 w-3.5 mr-2" />Solicitar cancelamento
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {cancelamentoAberto ? (
        <AppModal
          open
          onOpenChange={(open) => { if (!open && !cancelando) setCancelamentoAberto(false) }}
          title="Solicitar cancelamento de NFS-e"
          description="A solicitação será registrada com auditoria e ficará pendente de processamento fiscal."
          icon={<XCircle className="size-4 text-destructive" />}
          size="md"
          footer={
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setCancelamentoAberto(false)} disabled={cancelando}>Cancelar</Button>
              <Button type="button" variant="destructive" onClick={() => { void confirmarCancelamento() }} disabled={cancelando}>
                {cancelando ? 'Registrando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          }
        >
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={`Informe o motivo fiscal do cancelamento (mínimo ${MOTIVO_CANCELAMENTO_MIN} caracteres)`}
            className="min-h-28"
          />
        </AppModal>
      ) : null}

      {logsAbertos ? (
        <LogsNfseModal nota={nota} open onOpenChange={(open) => { if (!open) setLogsAbertos(false) }} />
      ) : null}
    </PararLinha>
  )
}
