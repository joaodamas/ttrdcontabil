'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, BookOpen, Loader2, MessageSquarePlus, Save, Send } from 'lucide-react'

import { createDocument, updateDocument } from '@/lib/firestore-client'
import { tsToDate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CARD_FICHA, SecaoIndisponivel } from './ficha-comum'
import { podeColaborarCliente } from './aba-atividade'
import type { FalhaSecao, Registro } from './use-ficha-cliente'

const CAMPOS = [
  ['fiscal',      'Procedimento fiscal',      'Ex: Emitir NFS-e todo dia 5. Código de serviço: 1401. ISS retido na fonte.'],
  ['financeiro',  'Procedimento financeiro',  'Ex: Boleto enviado automaticamente. Responsável: João. Aceita PIX.'],
  ['operacional', 'Procedimento operacional', 'Ex: Extrato enviado pelo portal X até o dia 3. Contato: Maria (11 9xxxx).'],
  ['geral',       'Notas gerais',             'Ex: Cliente prefere contato por e-mail. Reunião mensal toda última terça.'],
] as const
type CampoPop = (typeof CAMPOS)[number][0]

/** POP — procedimento operacional do cliente + notas internas (append-only). */
export function AbaPop({ clienteId, pop, popNotas, falhaPop, onRecarregar, onNotaCriada, onPopSalvo }: {
  clienteId: string; pop: Registro | null; popNotas: Registro[]; falhaPop?: FalhaSecao
  onRecarregar: () => void; onNotaCriada: (n: Registro) => void; onPopSalvo: (pop: Registro) => void
}) {
  const { usuario } = useAuth()
  const podeEscrever = podeColaborarCliente(usuario?.perfil)
  const [docId, setDocId] = useState<string | null>((pop?.id as string | undefined) ?? null)
  const [valores, setValores] = useState<Record<CampoPop, string>>(() => ({
    fiscal: (pop?.fiscal as string) ?? '', financeiro: (pop?.financeiro as string) ?? '',
    operacional: (pop?.operacional as string) ?? '', geral: (pop?.geral as string) ?? '',
  }))
  const [sujo, setSujo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nota, setNota] = useState('')
  const [salvandoNota, setSalvandoNota] = useState(false)

  if (falhaPop) return <SecaoIndisponivel falha={falhaPop} onRetry={onRecarregar} />

  async function salvarPop() {
    setSalvando(true)
    try {
      const payload = { clienteId, ...valores }
      let id = docId
      if (id) await updateDocument('clientes_pop', id, payload)
      else { id = (await createDocument('clientes_pop', payload)) as string; setDocId(id) }
      onPopSalvo({ id, ...payload })
      setSujo(false)
      toast.success('POP salvo.')
    } catch {
      toast.error('Não foi possível salvar o POP.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarNota() {
    if (!nota.trim()) return
    setSalvandoNota(true)
    try {
      const payload = {
        clienteId, texto: nota.trim(),
        autorNome: usuario?.nome ?? usuario?.email ?? 'Sistema', autorId: usuario?.uid ?? '', criadoEm: new Date(),
      }
      const id = await createDocument('clientes_pop_notas', payload)
      onNotaCriada({ id: id as string, ...payload })
      setNota('')
      toast.success('Nota interna registrada.')
    } catch {
      toast.error('Não foi possível salvar a nota.')
    } finally {
      setSalvandoNota(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card className={CARD_FICHA}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" />
            Procedimento operacional do cliente
          </CardTitle>
          {podeEscrever ? (
            <Button size="sm" className="h-8" onClick={() => void salvarPop()} disabled={salvando || !sujo}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4">
          <p className="text-xs text-muted-foreground">Notas operacionais internas — visíveis apenas pela equipe. Não são enviadas ao cliente.</p>
          {CAMPOS.map(([campo, label, placeholder]) => (
            <div key={campo} className="space-y-1.5">
              <label htmlFor={`pop-${campo}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
              <textarea
                id={`pop-${campo}`}
                readOnly={!podeEscrever}
                className="min-h-[80px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder={placeholder}
                value={valores[campo]}
                onChange={(e) => { setValores((v) => ({ ...v, [campo]: e.target.value })); setSujo(true) }}
              />
            </div>
          ))}
          {sujo ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Alterações não salvas — clique em Salvar para confirmar.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className={CARD_FICHA}>
        <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Notas internas</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">histórico completo</span>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {podeEscrever ? (
            <div className="flex items-end gap-2">
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void salvarNota() } }}
                placeholder="Registrar nota interna… (Enter para salvar)"
                aria-label="Nova nota interna"
                rows={2}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" variant="outline" aria-label="Salvar nota" disabled={!nota.trim() || salvandoNota} onClick={() => void salvarNota()} className="shrink-0">
                {salvandoNota ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ) : null}
          {popNotas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma nota registrada.</p>
          ) : (
            <ol className="space-y-2">
              {popNotas.map((n) => (
                <li key={n.id as string} className="rounded-md border border-border/60 bg-muted/25 px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm">{n.texto as string}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                    <span>{n.autorNome as string}</span>
                    <span>·</span>
                    <span>{tsToDate(n.criadoEm)?.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
