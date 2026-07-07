'use client'

import { AppModal } from '@/components/ui/app-modal'
import { Badge } from '@/components/ui/badge'
import { tsToDate, formatDateTime, formatCurrency } from '@/lib/utils'
import { FileText, CheckCircle2, XCircle, Clock, RefreshCw, Send } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'

type LogEntry = {
  id: string
  ts: Date
  evento: string
  detalhe?: string
  variante: 'success' | 'destructive' | 'warning' | 'neutral'
  icon: React.ReactNode
}

function buildLogs(nota: Record<string, unknown>): LogEntry[] {
  const logs: LogEntry[] = []
  const hoje = new Date()

  // Criação do rascunho
  const criadoEm = tsToDate(nota.criadoEm as Timestamp | undefined)
  if (criadoEm) {
    const automatica = nota.origemEmissao === 'automatica'
    logs.push({
      id: 'criado',
      ts: criadoEm,
      evento: automatica ? 'Rascunho criado (emissão automática, sem revisão)' : 'Rascunho criado',
      detalhe: `Valor: ${formatCurrency(Number(nota.valorServico ?? 0))}`,
      variante: automatica ? 'warning' : 'neutral',
      icon: <FileText className="h-3.5 w-3.5" />,
    })
  }

  // Envio para emissão
  const enviadoEm = tsToDate(nota.enviadoEm as Timestamp | undefined)
  if (enviadoEm) {
    logs.push({
      id: 'enviado',
      ts: enviadoEm,
      evento: 'Enviado para prefeitura',
      detalhe: nota.municipioNome as string | undefined,
      variante: 'neutral',
      icon: <Send className="h-3.5 w-3.5" />,
    })
  }

  // Tentativas (se campo existir)
  const tentativas = nota.tentativas as number | undefined
  if (tentativas && tentativas > 1) {
    const ultimaTentativa = tsToDate(nota.ultimaTentativaEm as Timestamp | undefined)
    logs.push({
      id: 'tentativas',
      ts: ultimaTentativa ?? hoje,
      evento: `${tentativas} tentativa(s) de emissão`,
      variante: 'warning',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
    })
  }

  // Erro de integração
  if ((nota.status as string) === 'rejeitada' || (nota.status as string) === 'erro_integracao') {
    const atualizadoEm = tsToDate(nota.atualizadoEm as Timestamp | undefined)
    const erro = (nota.erro as string | undefined) ?? (nota.erroIntegracao as string | undefined)
    const detalhe = (nota.erroDetalhes as string | undefined)
    logs.push({
      id: 'erro',
      ts: atualizadoEm ?? hoje,
      evento: `${(nota.status as string) === 'rejeitada' ? 'Rejeitada pela prefeitura' : 'Erro de integração'}`,
      detalhe: [erro, detalhe].filter(Boolean).join(' — ').slice(0, 200) || undefined,
      variante: 'destructive',
      icon: <XCircle className="h-3.5 w-3.5" />,
    })
  }

  // Pendente
  if ((nota.status as string) === 'pendente_processamento') {
    logs.push({
      id: 'pendente',
      ts: tsToDate(nota.atualizadoEm as Timestamp | undefined) ?? hoje,
      evento: 'Aguardando processamento da prefeitura',
      variante: 'warning',
      icon: <Clock className="h-3.5 w-3.5" />,
    })
  }

  // Emitida com sucesso
  const dataEmissao = tsToDate(nota.dataEmissao as Timestamp | undefined)
  if (dataEmissao && (nota.status as string) === 'emitida') {
    logs.push({
      id: 'emitida',
      ts: dataEmissao,
      evento: 'NFS-e emitida com sucesso',
      detalhe: nota.numeroNfse ? `Número: ${nota.numeroNfse as string}` : undefined,
      variante: 'success',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    })
  }

  // Cancelamento
  if ((nota.status as string) === 'cancelada') {
    const atualizadoEm = tsToDate(nota.atualizadoEm as Timestamp | undefined)
    logs.push({
      id: 'cancelada',
      ts: atualizadoEm ?? hoje,
      evento: 'NFS-e cancelada',
      detalhe: nota.motivoCancelamento as string | undefined,
      variante: 'destructive',
      icon: <XCircle className="h-3.5 w-3.5" />,
    })
  }

  return logs.sort((a, b) => a.ts.getTime() - b.ts.getTime())
}

const VARIANTE_CIRCLE: Record<LogEntry['variante'], string> = {
  success:     'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  warning:     'bg-warning/10 text-warning',
  neutral:     'bg-muted text-muted-foreground',
}

interface LogsNfseModalProps {
  nota: Record<string, unknown> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogsNfseModal({ nota, open, onOpenChange }: LogsNfseModalProps) {
  if (!nota) return null
  const logs = buildLogs(nota)
  const statusInfo = nota.status as string

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Logs — NFS-e ${(nota.numeroNfse as string) ?? (nota.id as string)}`}
      description={`${(nota.clienteNome as string) ?? 'Cliente'} · ${(nota.tomadorNome as string) ?? '—'}`}
      icon={<FileText className="size-4" />}
      badge={<Badge variant={statusInfo === 'emitida' ? 'success' : statusInfo === 'rejeitada' || statusInfo === 'erro_integracao' ? 'destructive' : 'outline'}>{statusInfo}</Badge>}
      size="md"
    >
      {logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum log disponível para esta nota.</p>
      ) : (
        <ol className="relative pl-10 space-y-0">
          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" aria-hidden />
          {logs.map(log => (
            <li key={log.id} className="relative pb-5 last:pb-0">
              <span className={`absolute -left-[15px] top-0 flex h-8 w-8 items-center justify-center rounded-full ${VARIANTE_CIRCLE[log.variante]}`}>
                {log.icon}
              </span>
              <div className="ml-1 space-y-0.5 pt-1">
                <p className="text-sm font-medium">{log.evento}</p>
                {log.detalhe && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{log.detalhe}</p>}
                <time className="block text-[11px] text-muted-foreground/70 tabular-nums">{formatDateTime(log.ts)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AppModal>
  )
}
