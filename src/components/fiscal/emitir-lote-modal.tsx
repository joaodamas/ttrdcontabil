'use client'

/**
 * Modal de emissão de NFS-e em lote.
 *
 * Carrega os rascunhos com status 'aguardando_emissao', permite selecionar
 * quais emitir e chama a Cloud Function `emitirNfseLote`.
 *
 * Limite por chamada: 50 notas (imposto pela Cloud Function).
 *
 * Uso:
 *   <EmitirLoteModal open={open} onOpenChange={setOpen} onSuccess={handleSuccess} />
 */
import { useState, useEffect, useCallback } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { where } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/ui/app-modal'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, SendHorizonal } from 'lucide-react'
import { toast } from 'sonner'
import { getFirebaseApp } from '@/lib/firebase'

const LOTE_MAX = 50

interface Rascunho {
  id:           string
  clienteId:    string
  clienteNome:  string
  competenciaId?: string | null
  valorServico: number
  dados:        Record<string, unknown>
}

interface ResultadoLote {
  index:     number
  clienteId: string
  sucesso:   boolean
  numeroNfse?: string
  erro?:     string
}

interface EmitirLoteModalProps {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  /** Chamado após o lote ser processado (independente de erros parciais). */
  onSuccess?:    () => void
}

type Step = 'select' | 'running' | 'done'

export function EmitirLoteModal({ open, onOpenChange, onSuccess }: EmitirLoteModalProps) {
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([])
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const [step,      setStep]      = useState<Step>('select')
  const [resultados, setResultados] = useState<ResultadoLote[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const docs = await listDocuments('nfse_rascunhos', [
        where('status', '==', 'aguardando_emissao'),
      ])
      const mapped: Rascunho[] = docs.map((d) => {
        const r = d as Record<string, unknown>
        const dados = (r.dados ?? {}) as Record<string, unknown>
        return {
          id:           r.id as string,
          clienteId:    (r.clienteId ?? dados.clienteId ?? '') as string,
          clienteNome:  (r.clienteNome ?? r.titulo ?? '') as string,
          competenciaId: (r.competenciaId ?? dados.competenciaId ?? null) as string | null,
          valorServico: (dados.valorServico ?? r.valorServico ?? 0) as number,
          dados,
        }
      })
      setRascunhos(mapped)
      setSelected(new Set(mapped.slice(0, LOTE_MAX).map((r) => r.id)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setStep('select')
      setResultados([])
      load()
    }
  }, [open, load])

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(rascunhos.slice(0, LOTE_MAX).map((r) => r.id)))
    } else {
      setSelected(new Set())
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < LOTE_MAX) {
        next.add(id)
      } else {
        toast.warning(`Máximo de ${LOTE_MAX} notas por lote.`)
      }
      return next
    })
  }

  async function handleEmitir() {
    if (selected.size === 0) return

    const itensParaEmitir = rascunhos
      .filter((r) => selected.has(r.id))
      .map((r) => {
        const tomador = (r.dados.tomador as Record<string, unknown> | undefined) ?? {
          razaoSocial: r.dados.tomadorNome,
          cpfCnpj: r.dados.tomadorCpfCnpj,
          email: r.dados.tomadorEmail || undefined,
        }
        const servico = (r.dados.servico as Record<string, unknown> | undefined) ?? {
          discriminacao: r.dados.descricaoServico,
          codigoServico: r.dados.codigoServico,
          valorServico: r.dados.valorServico,
          aliquota: r.dados.aliquota ?? undefined,
          issRetido: r.dados.issRetido,
        }

        return {
          clienteId:   r.clienteId,
          rascunhoId:  r.id,
          tomador,
          servico,
          competenciaId: r.competenciaId ?? r.dados.competenciaId ?? undefined,
          numeroRps:   r.dados.numeroRps ?? undefined,
          serieRps:    r.dados.serieRps ?? undefined,
        }
      })

    setStep('running')

    try {
      const fn = httpsCallable<{ itens: unknown[] }, { resultados: ResultadoLote[]; sucessos: number; falhas: number }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'emitirNfseLote'
      )
      const { data } = await fn({ itens: itensParaEmitir })
      setResultados(data.resultados)
      setStep('done')

      if (data.falhas === 0) {
        toast.success(`${data.sucessos} NFS-e emitida(s) com sucesso.`)
      } else {
        toast.warning(`${data.sucessos} emitida(s), ${data.falhas} com erro.`)
      }

      onSuccess?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao emitir lote.'
      toast.error(msg)
      setStep('select')
    }
  }

  const allSelected = rascunhos.length > 0 && selected.size === Math.min(rascunhos.length, LOTE_MAX)
  const totalSelecionado = rascunhos.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.valorServico, 0)
  const footer = step === 'select' ? (
    <>
      <span className="mr-auto text-xs text-muted-foreground">
        {selected.size} selecionada(s) · {formatCurrency(totalSelecionado)}
      </span>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancelar
      </Button>
      <Button disabled={selected.size === 0} onClick={handleEmitir}>
        <SendHorizonal className="w-4 h-4 mr-1.5" />
        Emitir {selected.size > 0 ? `(${selected.size})` : ''}
      </Button>
    </>
  ) : step === 'done' ? (
    <Button onClick={() => onOpenChange(false)}>Fechar</Button>
  ) : undefined

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Emitir NFS-e em Lote"
      description={`Selecione os rascunhos para emitir. Máximo de ${LOTE_MAX} por vez.`}
      icon={<SendHorizonal className="size-4" />}
      size="lg"
      footer={footer}
    >

        {/* ── Etapa: seleção ─────────────────────────────────────────────── */}
        {step === 'select' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : rascunhos.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Nenhum rascunho aguardando emissão.
              </div>
            ) : (
              <div className="-mx-5">
                {/* Cabeçalho tabela */}
                <div className="flex items-center gap-3 border-b bg-background px-5 py-2 text-xs font-medium text-muted-foreground sticky top-0">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    className="shrink-0"
                  />
                  <span className="flex-1">Cliente</span>
                  <span className="w-28 text-right">Valor</span>
                </div>

                {rascunhos.map((r) => (
                  <div
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-5 py-2.5 transition-colors last:border-0 hover:bg-muted/30"
                    onClick={() => toggle(r.id)}
                  >
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <span className="flex-1 text-sm">{r.clienteNome || '—'}</span>
                    <span className="w-28 text-right text-sm font-medium tabular-nums">
                      {formatCurrency(r.valorServico)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Etapa: processando ─────────────────────────────────────────── */}
        {step === 'running' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Emitindo {selected.size} NFS-e… Não feche esta janela.
            </p>
          </div>
        )}

        {/* ── Etapa: resultado ───────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="-mx-5 px-5">
              <div className="flex gap-3 mb-4 text-sm">
                <Badge variant="default">
                  {resultados.filter((r) => r.sucesso).length} emitidas
                </Badge>
                {resultados.some((r) => !r.sucesso) && (
                  <Badge variant="destructive">
                    {resultados.filter((r) => !r.sucesso).length} com erro
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                {resultados.map((res) => {
                  const rascunho = rascunhos[res.index]
                  return (
                    <div
                      key={res.index}
                      className="flex items-start gap-2.5 py-2 border-b last:border-0"
                    >
                      {res.sucesso ? (
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {rascunho?.clienteNome ?? res.clienteId}
                        </p>
                        {res.sucesso ? (
                          <p className="text-xs text-muted-foreground">NFS-e nº {res.numeroNfse ?? '—'}</p>
                        ) : (
                          <p className="text-xs text-destructive truncate">{res.erro}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
        )}
    </AppModal>
  )
}
