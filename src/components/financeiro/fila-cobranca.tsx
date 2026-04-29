'use client'

import Link from 'next/link'
import { formatCurrency, formatDate, tsToDate } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { LancamentoBaixar } from '@/components/financeiro/lancamento-baixar'
import { motivoPrioridade } from '@/lib/financeiro-prioridade'
import { Building2, Mail, Wallet } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  item: Record<string, unknown>
  agora: Date
  onBaixado: (id: string) => void
}

export function FilaCobrancaItem({ item, agora, onBaixado }: Props) {
  const id = item.id as string
  const clienteId = item.clienteId as string | undefined
  const clienteEmail = item.clienteEmail as string | undefined
  const venc = tsToDate(item.dataVencimento)
  const atrasado = !!(venc && venc < agora && item.status === 'pendente')
  const descricao = String(item.descricao ?? 'Recebível')
  const valorFmt = formatCurrency(item.valor as number)
  const vencFmt = venc ? formatDate(venc) : '—'
  const mailSubject = encodeURIComponent(`Cobrança: ${descricao}`)
  const mailBody = encodeURIComponent(
    `Olá,\n\nGostaria de alinhar o recebível "${descricao}" no valor de ${valorFmt}, com vencimento em ${vencFmt}.\n\n[Preencha condições ou proposta]\n\nAtenciosamente,\n`
  )
  const mailtoHref = clienteEmail?.includes('@')
    ? `mailto:${clienteEmail}?subject=${mailSubject}&body=${mailBody}`
    : `mailto:?subject=${mailSubject}&body=${mailBody}`

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{item.descricao as string}</p>
          {atrasado ? (
            <Badge variant="destructive" className="shrink-0 text-[10px]">
              Atrasado
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              A vencer
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {(item.clienteNome as string) ?? '—'} · Venc. {venc ? formatDate(venc) : '—'}
        </p>
        <Tooltip>
          <TooltipTrigger>
            <p className="cursor-help text-xs font-medium text-foreground/90">
              Prioridade: {motivoPrioridade(item, agora)}
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-left leading-snug">
            Ordem da fila considera atraso, proximidade do vencimento e valor. Itens no topo devem ser cobrados ou
            baixados primeiro.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <p className="text-right text-lg font-bold tabular-nums">
          {formatCurrency(item.valor as number)}
        </p>
        <div className="flex flex-wrap justify-end gap-1.5">
          {clienteId ? (
            <Link
              href={`/clientes/${clienteId}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8')}
            >
              <Building2 className="mr-1 h-3.5 w-3.5" />
              Cliente
            </Link>
          ) : null}
          <Link
            href={clienteId ? `/financeiro?clienteId=${clienteId}&status=pendente` : '/financeiro?status=pendente'}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8')}
          >
            <Wallet className="mr-1 h-3.5 w-3.5" />
            Fila
          </Link>
          <Tooltip>
            <TooltipTrigger>
              <a
                href={mailtoHref}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8')}
              >
                <Mail className="mr-1 h-3.5 w-3.5" />
                Negociar
              </a>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left leading-snug">
              Abre o e-mail com assunto e texto sugeridos. O destinatário usa o e-mail do lançamento, se existir; senão, o
              e-mail do cadastro do cliente (carregado na fila). CRM e templates avançados ficam no roadmap.
            </TooltipContent>
          </Tooltip>
          <LancamentoBaixar lancamentoId={id} onBaixado={() => onBaixado(id)} />
        </div>
      </div>
    </div>
  )
}
