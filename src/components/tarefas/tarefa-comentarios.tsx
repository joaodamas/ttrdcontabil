'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Send } from 'lucide-react'

interface Comentario {
  id: string
  texto: string
  criadoEm: string
  usuarioNome?: string
  /** @deprecated use usuarioNome */
  usuario?: { nome: string } | null
}

interface TarefaComentariosProps {
  tarefaId: string
  comentariosIniciais: Comentario[]
}

export function TarefaComentarios({ tarefaId, comentariosIniciais }: TarefaComentariosProps) {
  const [comentarios, setComentarios] = useState<Comentario[]>(comentariosIniciais)
  const [texto, setTexto]             = useState('')
  const [enviando, setEnviando]       = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function formatarData(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  async function enviarComentario() {
    const trimmed = texto.trim()
    if (!trimmed) return

    setEnviando(true)
    try {
      const res = await fetch(`/api/tarefas/${tarefaId}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: trimmed }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Erro ao enviar comentário')
        return
      }

      const novo = await res.json()
      setComentarios((prev) => [
        ...prev,
        {
          id:          novo.id,
          texto:       novo.texto,
          criadoEm:    novo.criadoEm,
          usuarioNome: novo.usuarioNome ?? novo.usuario?.nome ?? 'Usuário',
        },
      ])
      setTexto('')
      textareaRef.current?.focus()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      enviarComentario()
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-sm font-semibold">
          Comentários{comentarios.length > 0 ? ` (${comentarios.length})` : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Lista de comentários */}
        {comentarios.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Nenhum comentário ainda. Seja o primeiro!
          </p>
        ) : (
          <ul className="divide-y max-h-80 overflow-y-auto">
            {comentarios.map((c) => (
              <li key={c.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    {c.usuarioNome ?? c.usuario?.nome ?? 'Usuário'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatarData(c.criadoEm)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
              </li>
            ))}
          </ul>
        )}

        {/* Formulário de novo comentário */}
        <div className="border-t p-4 space-y-2">
          <Textarea
            ref={textareaRef}
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Adicione um comentário... (Ctrl+Enter para enviar)"
            disabled={enviando}
          />
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              onClick={enviarComentario}
              disabled={enviando || !texto.trim()}
            >
              {enviando ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              Enviar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
