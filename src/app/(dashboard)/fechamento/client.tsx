'use client'

import { useState, useEffect, useTransition, useCallback, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { FechamentoTable } from '@/components/fechamento/fechamento-table'
import { FechamentoPendenciasCards } from '@/components/fechamento/fechamento-pendencias-cards'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/inline-alert'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { RefreshCw, Plus, CheckCircle2, Clock, AlertCircle, ClipboardList } from 'lucide-react'
import {
  getFechamentos,
  getClientes,
  createDocument,
  updateDocument,
} from '@/lib/firestore-client'

const MESES = [
  { value: 1,  label: 'Janeiro'   },
  { value: 2,  label: 'Fevereiro' },
  { value: 3,  label: 'Março'     },
  { value: 4,  label: 'Abril'     },
  { value: 5,  label: 'Maio'      },
  { value: 6,  label: 'Junho'     },
  { value: 7,  label: 'Julho'     },
  { value: 8,  label: 'Agosto'    },
  { value: 9,  label: 'Setembro'  },
  { value: 10, label: 'Outubro'   },
  { value: 11, label: 'Novembro'  },
  { value: 12, label: 'Dezembro'  },
]

const ANOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

const REGIMES = [
  { value: '',                  label: 'Todos os regimes' },
  { value: 'simples_nacional',  label: 'Simples Nacional' },
  { value: 'lucro_presumido',   label: 'Lucro Presumido'  },
  { value: 'lucro_real',        label: 'Lucro Real'       },
  { value: 'mei',               label: 'MEI'              },
]

type FechamentoRecord = {
  id: string
  clienteId: string
  clienteCodigo: number
  clienteNome: string
  regime: string
  responsavel: string
  portalUrl?: string
  formaEntrega?: string
  dasStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
  esocialStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
  reinfStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
  fgtsStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
}

function FechamentoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tabelaRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const mes = parseInt(searchParams.get('mes') ?? String(now.getMonth() + 1))
  const ano = parseInt(searchParams.get('ano') ?? String(now.getFullYear()))
  const regime = searchParams.get('regime') ?? ''
  const mesLabel = MESES.find((m) => m.value === mes)?.label ?? ''

  const [fechamentos, setFechamentos] = useState<FechamentoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [revisaoDialogOpen, setRevisaoDialogOpen] = useState(false)
  const [revisaoNota, setRevisaoNota] = useState('')
  const [revisaoSalva, setRevisaoSalva] = useState<{ nota: string; at: string } | null>(null)

  const revisaoStorageKey = `ttrd-fechamento-revisao:v1:${ano}:${mes}`

  useEffect(() => {
    try {
      const raw = localStorage.getItem(revisaoStorageKey)
      if (raw) setRevisaoSalva(JSON.parse(raw) as { nota: string; at: string })
      else setRevisaoSalva(null)
    } catch {
      setRevisaoSalva(null)
    }
  }, [revisaoStorageKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getFechamentos(mes, ano, regime || undefined)
      .then((data) => { if (!cancelled) setFechamentos(data as FechamentoRecord[]) })
      .catch(() => { if (!cancelled) toast.error('Erro ao carregar fechamentos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mes, ano, regime])

  async function load() {
    setLoading(true)
    try {
      const data = await getFechamentos(mes, ano, regime || undefined)
      setFechamentos(data as FechamentoRecord[])
    } catch {
      toast.error('Erro ao carregar fechamentos')
    } finally {
      setLoading(false)
    }
  }

  function navigate(params: Record<string, string | number>) {
    const sp = new URLSearchParams({
      mes: String(mes),
      ano: String(ano),
      ...(regime ? { regime } : {}),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    })
    if (!sp.get('regime')) sp.delete('regime')
    startTransition(() => {
      router.push(`/fechamento?${sp.toString()}`)
    })
  }

  async function gerarFechamento() {
    setGerando(true)
    try {
      const clientes = await getClientes({ status: 'ativo' })
      let criados = 0

      // Existing fechamentos for this month
      const existentes = await getFechamentos(mes, ano)
      const existentesIds = new Set(existentes.map((f) => (f as Record<string, unknown>).clienteId as string))

      for (const cliente of clientes) {
        const c = cliente as Record<string, unknown>
        if (existentesIds.has(c.id as string)) continue

        await createDocument('fechamentos', {
          clienteId: c.id,
          clienteNome: c.razaoSocial ?? '',
          clienteCodigo: c.codigo ?? 0,
          mes,
          ano,
          regime: c.regimeTributario ?? 'simples_nacional',
          responsavel: c.responsavelNome ?? '',
          portalUrl: c.portalUrl ?? null,
          formaEntrega: c.formaEntrega ?? null,
          dasStatus: 'pendente',
          esocialStatus: 'na',
          reinfStatus: 'na',
          fgtsStatus: 'na',
        })
        criados++
      }

      toast.success(`${criados} registros gerados para ${mesLabel}/${ano}`)
      await load()
    } catch {
      toast.error('Erro ao gerar fechamento')
    } finally {
      setGerando(false)
    }
  }

  const handleUpdate = useCallback(async (id: string, field: string, value: string) => {
    try {
      await updateDocument('fechamentos', id, { [field]: value })
      setFechamentos((prev) =>
        prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
      )
    } catch {
      toast.error('Erro ao salvar')
    }
  }, [])

  function registrarRevisaoMes() {
    const payload = { nota: revisaoNota.trim(), at: new Date().toISOString() }
    try {
      localStorage.setItem(revisaoStorageKey, JSON.stringify(payload))
      setRevisaoSalva(payload)
      toast.success('Revisão registrada neste dispositivo.')
    } catch {
      toast.error('Não foi possível salvar o registro')
      return
    }
    setRevisaoDialogOpen(false)
    setRevisaoNota('')
  }

  // Resumo stats
  const total = fechamentos.length
  const enviados = fechamentos.filter(
    (f) => f.dasStatus === 'enviado' || f.dasStatus === 'ok' || f.dasStatus === 'sm'
  ).length
  const pendentes = fechamentos.filter((f) => f.dasStatus === 'pendente').length
  const parciais = fechamentos.filter((f) => f.dasStatus === 'parcial').length
  const pct = total > 0 ? Math.round((enviados / total) * 100) : 0

  return (
    <div className="stack-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-title">Fechamento Mensal</h2>
          <p className="text-subtle">{mesLabel} / {ano}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { startTransition(() => load()) }}
            disabled={isPending || loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevisaoDialogOpen(true)}
            disabled={loading}
          >
            <ClipboardList className="w-4 h-4 mr-1" />
            Encerrar revisão do mês
          </Button>
          <Button size="sm" onClick={gerarFechamento} disabled={gerando || loading}>
            <Plus className="w-4 h-4 mr-1" />
            {gerando ? 'Gerando...' : 'Gerar Fechamento'}
          </Button>
        </div>
      </div>

      <Dialog open={revisaoDialogOpen} onOpenChange={setRevisaoDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Encerrar revisão de {mesLabel} / {ano}</DialogTitle>
            <DialogDescription>
              Registro local neste navegador (por competência). Útil para ritual de fechamento; auditoria no servidor pode ser adicionada depois.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Observação opcional (ex.: conferido com sócio, pendências externas…)"
            value={revisaoNota}
            onChange={(e) => setRevisaoNota(e.target.value)}
            className="min-h-24"
          />
          <DialogFooter className="flex flex-row flex-wrap justify-end gap-2 border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setRevisaoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={registrarRevisaoMes}>
              Confirmar encerramento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {revisaoSalva ? (
        <InlineAlert
          tone="success"
          title="Revisão do mês registrada neste dispositivo"
          description={
            `${new Date(revisaoSalva.at).toLocaleString('pt-BR')}` +
            (revisaoSalva.nota ? ` — ${revisaoSalva.nota}` : '')
          }
        />
      ) : null}

      {pendentes > 0 && (
        <InlineAlert
          tone="warning"
          title={`${pendentes} cliente(s) com pendência de fechamento`}
          description="Use os filtros e atualização em lote para avançar os status críticos primeiro."
        />
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={String(mes)}
          onValueChange={(v) => navigate({ mes: parseInt(v ?? String(mes)) })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((m) => (
              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(ano)}
          onValueChange={(v) => navigate({ ano: parseInt(v ?? String(ano)) })}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANOS.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={regime || 'all'}
          onValueChange={(v) => navigate({ regime: v === 'all' ? '' : (v ?? '') })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os regimes</SelectItem>
            {REGIMES.slice(1).map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-success mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Enviados</p>
                <p className="text-2xl font-bold text-success">{enviados}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-warning mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-warning">{pendentes}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-info mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Parciais</p>
                <p className="text-2xl font-bold text-info">{parciais}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso do mês</span>
            <span>{pct}% concluído</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {!loading && total > 0 ? (
        <FechamentoPendenciasCards
          fechamentos={fechamentos}
          onUpdate={handleUpdate}
          onIrParaTabela={() =>
            tabelaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      ) : null}

      {/* Loading state */}
      <div ref={tabelaRef} id="fechamento-tabela">
        {loading ? (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <TableRowSkeleton cols={6} rows={8} />
              </tbody>
            </table>
          </div>
        ) : (
          <FechamentoTable fechamentos={fechamentos} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  )
}

export function FechamentoClientPage() {
  return (
    <Suspense fallback={
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            <TableRowSkeleton cols={6} rows={8} />
          </tbody>
        </table>
      </div>
    }>
      <FechamentoContent />
    </Suspense>
  )
}
