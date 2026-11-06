'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'

import { createDocument } from '@/lib/firestore-client'
import { cn, formatCurrency, formatMesAno, tsToDate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Timeline, type TimelineEvent, type TimelineEventType } from '@/components/clientes/timeline'
import type { Registro } from './use-ficha-cliente'

/** Quem escreve no Cliente 360 (regra podeColaborarCliente): todos menos leitura. */
export const podeColaborarCliente = (perfil?: string) => !!perfil && perfil !== 'leitura'

function eventosDaTimeline(competencias: Registro[], lancamentos: Registro[], tarefas: Registro[], comentarios: Registro[]): TimelineEvent[] {
  const hoje = new Date()
  const events: TimelineEvent[] = []
  for (const c of competencias) {
    // Os campos gravados são atualizadoEm/criadoEm; sem data o evento é
    // omitido (datar de hoje seria inventar histórico).
    const ts = tsToDate(c.atualizadoEm ?? c.criadoEm)
    if (!ts) continue
    const status = c.status as string
    events.push({
      id: `comp-${c.id as string}`, type: 'competencia',
      title: `Competência ${formatMesAno(c.mes as number, c.ano as number)}`,
      description: c.servicoNome as string | undefined, timestamp: ts,
      variant: status === 'concluida' ? 'success' : status === 'aberta' ? 'warning' : 'neutral',
      href: `/competencias/${c.id as string}`, metadata: status,
    })
  }
  for (const l of lancamentos) {
    const ts = tsToDate(l.dataVencimento) ?? new Date()
    const status = l.status as string
    const vencido = ts < hoje && status === 'pendente'
    events.push({
      id: `lanc-${l.id as string}`, type: 'lancamento', title: (l.descricao as string) ?? 'Lançamento', timestamp: ts,
      variant: status === 'pago' ? 'success' : vencido ? 'destructive' : status === 'pendente' ? 'warning' : 'neutral',
      metadata: formatCurrency(l.valor as number),
    })
  }
  for (const t of tarefas) {
    const ts = tsToDate(t.atualizadoEm ?? t.criadoEm)
    if (!ts) continue
    const status = t.status as string
    const prazo = tsToDate(t.dataPrazo)
    const vencida = prazo ? prazo < hoje && ['pendente', 'em_andamento'].includes(status) : false
    events.push({
      id: `tarefa-${t.id as string}`, type: 'tarefa', title: (t.titulo as string) ?? 'Tarefa',
      description: t.responsavelNome as string | undefined, timestamp: ts,
      variant: status === 'concluida' ? 'success' : vencida ? 'destructive' : status === 'em_andamento' ? 'default' : 'neutral',
      href: `/tarefas/${t.id as string}`, metadata: status,
    })
  }
  for (const l of lancamentos) {
    const ultimoEnvio = tsToDate(l.ultimoEnvioWhatsappEm)
    if (!ultimoEnvio) continue
    const whatsStatus = (l.statusWhatsappCobranca as string | undefined) ?? ''
    events.push({
      id: `wa-${l.id as string}`, type: 'comentario',
      title: `Cobrança WhatsApp — ${(l.descricao as string) ?? 'lançamento'}`,
      description: `Status: ${whatsStatus || 'enviado'}`, timestamp: ultimoEnvio,
      variant: whatsStatus === 'lido' || whatsStatus === 'respondido' ? 'success' : whatsStatus === 'falhou' ? 'destructive' : 'neutral',
      metadata: whatsStatus || undefined, source: 'auto',
    })
  }
  for (const c of comentarios) {
    events.push({
      id: `comentario-${c.id as string}`, type: 'comentario', title: (c.texto as string) ?? 'Comentário',
      description: `por ${(c.autorNome as string) ?? 'usuário'}`, timestamp: tsToDate(c.criadoEm) ?? new Date(),
      variant: 'neutral', source: 'manual',
    })
  }
  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

const FILTROS = [
  ['todos', 'Todos'], ['tarefa', 'Tarefas'], ['competencia', 'Competências'], ['lancamento', 'Financeiro'], ['comentario', 'Comentários'],
] as const

export function AbaAtividade({ clienteId, competencias, lancamentos, tarefas, comentarios, onComentarioCriado }: {
  clienteId: string
  competencias: Registro[]; lancamentos: Registro[]; tarefas: Registro[]; comentarios: Registro[]
  onComentarioCriado: (c: Registro) => void
}) {
  const { usuario } = useAuth()
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [filtro, setFiltro] = useState<TimelineEventType | 'todos'>('todos')
  const todos = useMemo(() => eventosDaTimeline(competencias, lancamentos, tarefas, comentarios), [competencias, lancamentos, tarefas, comentarios])
  const eventos = useMemo(() => (filtro === 'todos' ? todos : todos.filter((e) => e.type === filtro)).slice(0, 20), [todos, filtro])
  const podeComentar = podeColaborarCliente(usuario?.perfil)

  async function salvar() {
    if (!texto.trim()) return
    setSalvando(true)
    try {
      const payload = {
        clienteId, texto: texto.trim(),
        autorNome: usuario?.nome ?? usuario?.email ?? 'Sistema', autorId: usuario?.uid ?? '', criadoEm: new Date(),
      }
      const id = await createDocument('clientes_comentarios', payload)
      onComentarioCriado({ id: id as string, ...payload })
      setTexto('')
      toast.success('Comentário adicionado.')
    } catch {
      toast.error('Não foi possível salvar o comentário.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      {podeComentar ? (
        <div className="mb-4 flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void salvar() } }}
            placeholder="Adicionar comentário rápido… (Enter para salvar)"
            aria-label="Novo comentário"
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" variant="outline" aria-label="Salvar comentário" disabled={!texto.trim() || salvando} onClick={() => void salvar()} className="shrink-0">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTROS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filtro === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Timeline events={eventos} />
    </div>
  )
}
