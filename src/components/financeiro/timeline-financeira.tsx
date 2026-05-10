'use client'

import { formatCurrency, formatDateTime, tsToDate } from '@/lib/utils'
import { DollarSign, MessageCircle, CheckCircle2, XCircle, Clock, RotateCcw, Pause } from 'lucide-react'
import { AppModal } from '@/components/ui/app-modal'
import { Badge } from '@/components/ui/badge'

type Lancamento = Record<string, unknown>

type TimelineEvento = {
  id: string
  tipo: 'cobranca_enviada' | 'resposta' | 'baixa' | 'atraso' | 'reagendado' | 'pausado' | 'estorno'
  titulo: string
  detalhe?: string
  ts: Date
  variante: 'success' | 'warning' | 'destructive' | 'neutral'
}

const TIPO_ICON: Record<TimelineEvento['tipo'], React.ComponentType<{ className?: string }>> = {
  cobranca_enviada: MessageCircle,
  resposta:         MessageCircle,
  baixa:            CheckCircle2,
  atraso:           Clock,
  reagendado:       RotateCcw,
  pausado:          Pause,
  estorno:          XCircle,
}

const VARIANTE_COLOR: Record<TimelineEvento['variante'], string> = {
  success:     'text-success bg-success/10',
  warning:     'text-warning bg-warning/10',
  destructive: 'text-destructive bg-destructive/10',
  neutral:     'text-muted-foreground bg-muted',
}

function buildEventos(lancamento: Lancamento): TimelineEvento[] {
  const eventos: TimelineEvento[] = []
  const hoje = new Date()

  // Evento inicial: criação
  const criadoEm = tsToDate(lancamento.criadoEm)
  if (criadoEm) {
    eventos.push({
      id:       'criado',
      tipo:     'reagendado',
      titulo:   'Lançamento criado',
      detalhe:  `Valor: ${formatCurrency(Number(lancamento.valor) || 0)}`,
      ts:       criadoEm,
      variante: 'neutral',
    })
  }

  // Evento de atraso (sintético — se estiver pendente e vencido)
  const venc = tsToDate(lancamento.dataVencimento)
  if (venc && venc < hoje && lancamento.status === 'pendente') {
    eventos.push({
      id:       'atraso',
      tipo:     'atraso',
      titulo:   'Cobrança em atraso',
      detalhe:  `Vencimento: ${venc.toLocaleDateString('pt-BR')}`,
      ts:       venc,
      variante: 'destructive',
    })
  }

  // Envios WhatsApp
  const ultimoEnvio = tsToDate(lancamento.ultimoEnvioWhatsappEm)
  if (ultimoEnvio) {
    const wsStatus = (lancamento.statusWhatsappCobranca as string) ?? 'enviado'
    eventos.push({
      id:       'wa-ultimo',
      tipo:     'cobranca_enviada',
      titulo:   `WhatsApp ${wsStatus}`,
      detalhe:  (lancamento.etapaWhatsappAtual as string | undefined) ?? undefined,
      ts:       ultimoEnvio,
      variante: wsStatus === 'lido' || wsStatus === 'respondido' ? 'success' : wsStatus === 'falhou' ? 'destructive' : 'neutral',
    })
  }

  // Pausa da régua
  if (lancamento.whatsappCobrancaPausada) {
    const pausadoEm = tsToDate(lancamento.whatsappCobrancaPausadaEm)
    eventos.push({
      id:       'pausado',
      tipo:     'pausado',
      titulo:   'Régua de cobrança pausada',
      detalhe:  (lancamento.whatsappCobrancaPausadaMotivo as string | undefined) ?? undefined,
      ts:       pausadoEm ?? hoje,
      variante: 'warning',
    })
  }

  // Pagamento
  const dataPagamento = tsToDate(lancamento.dataPagamento)
  if (dataPagamento && lancamento.status === 'pago') {
    eventos.push({
      id:       'pago',
      tipo:     'baixa',
      titulo:   'Pagamento recebido',
      detalhe:  `${dataPagamento.toLocaleDateString('pt-BR')}`,
      ts:       dataPagamento,
      variante: 'success',
    })
  }

  // Estorno
  if (lancamento.status === 'estornado') {
    const atualizadoEm = tsToDate(lancamento.atualizadoEm)
    eventos.push({
      id:       'estorno',
      tipo:     'estorno',
      titulo:   'Lançamento estornado',
      ts:       atualizadoEm ?? hoje,
      variante: 'destructive',
    })
  }

  return eventos.sort((a, b) => b.ts.getTime() - a.ts.getTime())
}

interface TimelineFinanceiraModalProps {
  lancamento: Lancamento | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TimelineFinanceiraModal({ lancamento, open, onOpenChange }: TimelineFinanceiraModalProps) {
  if (!lancamento) return null
  const eventos = buildEventos(lancamento)
  const descricao = (lancamento.descricao as string) ?? 'Lançamento'
  const cliente = (lancamento.clienteNome as string | undefined)

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Timeline — ${descricao}`}
      description={cliente ? `Cliente: ${cliente} · ${formatCurrency(Number(lancamento.valor) || 0)}` : formatCurrency(Number(lancamento.valor) || 0)}
      icon={<DollarSign className="size-4" />}
      badge={<Badge variant={(lancamento.status as string) === 'pago' ? 'success' : (lancamento.status as string) === 'pendente' ? 'outline' : 'destructive'}>{lancamento.status as string}</Badge>}
      size="md"
    >
      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum evento registrado para este lançamento.</p>
      ) : (
        <ol className="relative space-y-0 pl-10">
          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" aria-hidden="true" />
          {eventos.map(ev => {
            const Icon = TIPO_ICON[ev.tipo]
            const colorClass = VARIANTE_COLOR[ev.variante]
            return (
              <li key={ev.id} className="relative pb-5 last:pb-0">
                <span className={`absolute -left-[15px] top-0 flex h-8 w-8 items-center justify-center rounded-full ${colorClass}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="ml-1 space-y-0.5 pt-1">
                  <p className="text-sm font-medium">{ev.titulo}</p>
                  {ev.detalhe && <p className="text-xs text-muted-foreground">{ev.detalhe}</p>}
                  <time className="block text-[11px] text-muted-foreground/70 tabular-nums">{formatDateTime(ev.ts)}</time>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </AppModal>
  )
}
