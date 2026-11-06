'use client'

/**
 * Modal de emissão de NFS-e em lote.
 *
 * Carrega os rascunhos com status 'aguardando_emissao', permite selecionar
 * quais emitir e chama a Cloud Function `emitirNfseLote`.
 *
 * Limite por chamada: 25 notas (imposto pela Cloud Function, que também tem orçamento de tempo).
 *
 * Uso:
 *   <EmitirLoteModal open={open} onOpenChange={setOpen} onSuccess={handleSuccess} />
 */
import { useState, useEffect, useCallback } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { limit, where } from 'firebase/firestore'
import { getDocument, listDocuments } from '@/lib/firestore-client'
import { bloqueiosDe, preValidarRascunho, type AchadoFiscal } from '@/lib/nfse-pre-validacao'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/ui/app-modal'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, SendHorizonal } from 'lucide-react'
import { toast } from 'sonner'
import { getFirebaseApp } from '@/lib/firebase'

const LOTE_MAX = 25 // igual a functions/src/nfse/emitir-lote.ts

interface Rascunho {
  id:           string
  clienteId:    string
  clienteNome:  string
  competenciaId?: string | null
  valorServico: number
  dados:        Record<string, unknown>
  /**
   * Bloqueios da pré-validação fiscal (mesmo motor do servidor). Rascunho
   * bloqueado não pode ser selecionado: o servidor recusaria sem enviar.
   */
  bloqueios:    AchadoFiscal[]
}

/** Configuração fiscal e cadastro de cada prestador do lote (para a pré-validação). */
async function contextoDosClientes(clienteIds: string[]) {
  const pares = await Promise.all(clienteIds.map(async (id) => {
    const [cliente, fiscais] = await Promise.all([
      getDocument<{ cpfCnpj?: string; razaoSocial?: string }>('clientes', id).catch(() => null),
      listDocuments<Record<string, unknown>>('clientes_fiscal', [where('clienteId', '==', id), limit(1)]).catch(() => []),
    ])
    return [id, { cliente: cliente ?? undefined, fiscal: fiscais[0] ?? null }] as const
  }))
  return new Map(pares)
}

const SEM_CONFIG: AchadoFiscal = {
  regra: 'sem_configuracao', campo: 'config.regime', severidade: 'bloqueio',
  mensagem: 'Cliente sem configuração fiscal — configure antes de emitir.',
}

interface ResultadoLote {
  index:     number
  rascunhoId?: string
  clienteId: string
  sucesso:   boolean
  numeroNfse?: string
  erro?:     string
  naoProcessado?: boolean
  jaEmitida?: boolean
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
      const clienteIds = [...new Set(docs.map((d) => String((d as Record<string, unknown>).clienteId ?? '')).filter(Boolean))]
      const contexto = await contextoDosClientes(clienteIds)
      const mapped: Rascunho[] = docs.map((d) => {
        const r = d as Record<string, unknown>
        const dados = (r.dados ?? {}) as Record<string, unknown>
        const clienteId = (r.clienteId ?? dados.clienteId ?? '') as string
        const competenciaId = (r.competenciaId ?? dados.competenciaId ?? null) as string | null
        const ctx = contexto.get(clienteId)
        return {
          id:           r.id as string,
          clienteId,
          clienteNome:  (r.clienteNome ?? r.titulo ?? '') as string,
          competenciaId,
          valorServico: (dados.valorServico ?? r.valorServico ?? 0) as number,
          dados,
          bloqueios: ctx?.fiscal
            ? bloqueiosDe(preValidarRascunho({ id: r.id as string, clienteId, competenciaId, dados }, ctx.fiscal, ctx.cliente))
            : [SEM_CONFIG],
        }
      })
      // Bloqueados por último; a seleção inicial só pega os que podem sair.
      mapped.sort((a, b) => Number(a.bloqueios.length > 0) - Number(b.bloqueios.length > 0))
      setRascunhos(mapped)
      setSelected(new Set(mapped.filter((r) => r.bloqueios.length === 0).slice(0, LOTE_MAX).map((r) => r.id)))
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

  const emitiveis = rascunhos.filter((r) => r.bloqueios.length === 0)
  const bloqueados = rascunhos.length - emitiveis.length

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(emitiveis.slice(0, LOTE_MAX).map((r) => r.id)))
    } else {
      setSelected(new Set())
    }
  }

  function toggle(id: string) {
    const r = rascunhos.find((x) => x.id === id)
    if (r && r.bloqueios.length > 0) {
      toast.error(`Rascunho bloqueado: ${r.bloqueios[0].mensagem}`)
      return
    }
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
    if (selected.size === 0 || step === 'running') return

    // Só os ids: o servidor relê cada rascunho (normalizador único) — o payload
    // da nota não sai mais do navegador.
    const rascunhoIds = rascunhos.filter((r) => selected.has(r.id) && r.bloqueios.length === 0).map((r) => r.id)
    if (rascunhoIds.length === 0) return

    setStep('running')

    try {
      const fn = httpsCallable<{ rascunhoIds: string[] }, { resultados: ResultadoLote[]; sucessos: number; falhas: number; naoProcessados?: number }>(
        getFunctions(getFirebaseApp(), 'southamerica-east1'),
        'emitirNfseLote',
        { timeout: 540_000 },
      )
      const { data } = await fn({ rascunhoIds })
      setResultados(data.resultados)
      setStep('done')

      const naoProcessados = data.naoProcessados ?? 0
      if (data.falhas === 0) {
        toast.success(`${data.sucessos} NFS-e emitida(s) com sucesso.`)
      } else if (naoProcessados > 0) {
        toast.warning(`${data.sucessos} emitida(s), ${data.falhas - naoProcessados} com erro e ${naoProcessados} não processada(s) por tempo — selecione de novo para emitir.`)
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

  const allSelected = emitiveis.length > 0 && selected.size === Math.min(emitiveis.length, LOTE_MAX)
  const totalSelecionado = rascunhos.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.valorServico, 0)
  const footer = step === 'select' ? (
    <>
      <span className="mr-auto text-xs text-muted-foreground">
        {selected.size} selecionada(s) · {formatCurrency(totalSelecionado)}
        {bloqueados > 0 ? ` · ${bloqueados} bloqueada(s) pela pré-validação` : ''}
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
                    className={[
                      'flex items-center gap-3 border-b px-5 py-2.5 transition-colors last:border-0',
                      r.bloqueios.length > 0 ? 'cursor-not-allowed bg-destructive/[0.03]' : 'cursor-pointer hover:bg-muted/30',
                    ].join(' ')}
                    onClick={() => toggle(r.id)}
                  >
                    <Checkbox
                      checked={selected.has(r.id)}
                      disabled={r.bloqueios.length > 0}
                      onCheckedChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{r.clienteNome || '—'}</span>
                      {r.bloqueios.length > 0 && (
                        <span className="block text-xs text-destructive" title={r.bloqueios.map((b) => b.mensagem).join('\n')}>
                          Bloqueado: {r.bloqueios[0].mensagem}
                          {r.bloqueios.length > 1 ? ` (+${r.bloqueios.length - 1})` : ''} — revise o rascunho.
                        </span>
                      )}
                    </span>
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
                  // Por id: `index` é a posição na SELEÇÃO, não na lista inteira.
                  const rascunho = rascunhos.find((r) => r.id === res.rascunhoId)
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
                          <p className="text-xs text-muted-foreground">
                            NFS-e nº {res.numeroNfse ?? '—'}{res.jaEmitida ? ' (já existia — registrada sem reenviar)' : ''}
                          </p>
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
