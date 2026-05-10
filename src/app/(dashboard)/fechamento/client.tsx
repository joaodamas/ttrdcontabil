'use client'

import { useState, useEffect, useTransition, useCallback, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { FechamentoTable } from '@/components/fechamento/fechamento-table'
import { FechamentoPendenciasCards } from '@/components/fechamento/fechamento-pendencias-cards'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  updateFechamentoField,
  gerarFechamentoMensal,
  salvarRevisao,
  buscarRevisao,
  type RevisaoRecord,
} from '@/features/fechamento/services'
import { fechamentoFiltroSchema } from '@/features/fechamento/schemas'
import { useFechamentoList } from '@/features/fechamento/hooks'
import { fechamentoKeys } from '@/features/fechamento/queries'
import { getErrorMessage } from '@/lib/error-message'
import type { FechamentoFilters, FechamentoRecord } from '@/features/fechamento/types'

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

function FechamentoContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tabelaRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const parsed: FechamentoFilters = fechamentoFiltroSchema.parse({
    mes: parseInt(searchParams.get('mes') ?? String(now.getMonth() + 1)),
    ano: parseInt(searchParams.get('ano') ?? String(now.getFullYear())),
    regime: searchParams.get('regime') ?? '',
  })
  const { mes, ano, regime } = parsed
  const mesLabel = MESES.find((m) => m.value === mes)?.label ?? ''

  const [fechamentos, setFechamentos] = useState<FechamentoRecord[]>([])
  const { fechamentos: fechamentosData, isLoading: loading, refetch } = useFechamentoList(parsed)
  const { usuario } = useAuth()
  const [gerando, setGerando] = useState(false)
  const [confirmGeracaoOpen, setConfirmGeracaoOpen] = useState(false)
  const [revisaoDialogOpen, setRevisaoDialogOpen] = useState(false)
  const [revisaoNota, setRevisaoNota] = useState('')
  const [revisaoSalva, setRevisaoSalva] = useState<RevisaoRecord | null>(null)
  const [revisaoLoading, setRevisaoLoading] = useState(false)
  const [confirmRevisaoOpen, setConfirmRevisaoOpen] = useState(false)

  useEffect(() => {
    setRevisaoLoading(true)
    buscarRevisao(ano, mes)
      .then(setRevisaoSalva)
      .catch(() => setRevisaoSalva(null))
      .finally(() => setRevisaoLoading(false))
  }, [ano, mes])

  useEffect(() => {
    setFechamentos(fechamentosData as FechamentoRecord[])
  }, [fechamentosData])

  async function load() {
    try {
      await refetch()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível carregar fechamentos. Verifique conexão e permissões.'))
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
      const result = await gerarFechamentoMensal(parsed)

      toast.success(
        `${result.criados} registro(s) gerado(s) para ${mesLabel}/${ano}. ${result.ignorados} ignorado(s).`
      )
      await queryClient.invalidateQueries({ queryKey: fechamentoKeys.list(parsed) })
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível gerar fechamento. Verifique perfil operacional e tente novamente.'))
    } finally {
      setGerando(false)
    }
  }

  const handleUpdate = useCallback(async (id: string, field: string, value: string) => {
    try {
      await updateFechamentoField(id, field, value)
      setFechamentos((prev) =>
        prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
      )
      await queryClient.invalidateQueries({ queryKey: fechamentoKeys.list(parsed) })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o status do fechamento. Atualize a tela e tente novamente.'))
    }
  }, [parsed, queryClient])

  async function registrarRevisaoMes() {
    try {
      await salvarRevisao(
        ano,
        mes,
        revisaoNota.trim(),
        usuario?.uid ?? '',
        usuario?.nome ?? usuario?.email ?? 'Usuário',
        {
          totalFechamentos: total,
          pendentes,
          parciais,
          enviados,
          snapshotStatus: statusSnapshot,
        }
      )
      setRevisaoSalva(await buscarRevisao(ano, mes))
      toast.success('Revisão registrada com auditoria.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível registrar a revisão. Verifique permissões e tente novamente.'))
      return
    }
    setRevisaoDialogOpen(false)
    setConfirmRevisaoOpen(false)
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
  const statusSnapshot = fechamentos.reduce<Record<string, number>>((acc, fechamento) => {
    for (const field of ['dasStatus', 'esocialStatus', 'reinfStatus', 'fgtsStatus'] as const) {
      const key = `${field}:${fechamento[field]}`
      acc[key] = (acc[key] ?? 0) + 1
    }
    return acc
  }, {})
  const statusComPendencia = new Set(['pendente', 'guia', 'parcial'])
  const fechamentosComPendencia = fechamentos.filter((f) =>
    [f.dasStatus, f.esocialStatus, f.reinfStatus, f.fgtsStatus].some((status) => statusComPendencia.has(status))
  )
  const totalObrigacoesPendentes = fechamentos.reduce((acc, f) =>
    acc + [f.dasStatus, f.esocialStatus, f.reinfStatus, f.fgtsStatus].filter((status) => statusComPendencia.has(status)).length
  , 0)

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
            disabled={loading || revisaoLoading}
          >
            <ClipboardList className="w-4 h-4 mr-1" />
            Encerrar revisão do mês
          </Button>
          <Button size="sm" onClick={() => setConfirmGeracaoOpen(true)} disabled={gerando || loading}>
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
              O registro fica salvo no Firestore com usuário, data e observação para auditoria do fechamento.
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
            <Button type="button" onClick={() => setConfirmRevisaoOpen(true)}>
              Revisar e confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRevisaoOpen}
        onOpenChange={setConfirmRevisaoOpen}
        title={
          fechamentosComPendencia.length > 0
            ? `Encerrar ${mesLabel}/${ano} com pendências?`
            : `Encerrar revisão de ${mesLabel}/${ano}?`
        }
        description={
          fechamentosComPendencia.length > 0
            ? `${fechamentosComPendencia.length} cliente(s) ainda têm ${totalObrigacoesPendentes} obrigação(ões) pendente(s), com guia ou parcial. O encerramento será salvo como evidência de auditoria mesmo com essas pendências. Confirme somente se elas foram justificadas ou assumidas fora do fluxo.`
            : 'O registro fica salvo no Firestore com usuário, data e observação para auditoria do fechamento.'
        }
        confirmLabel={fechamentosComPendencia.length > 0 ? 'Encerrar mesmo assim' : 'Registrar revisão'}
        cancelLabel="Voltar para revisão"
        destructive={fechamentosComPendencia.length > 0}
        onConfirm={registrarRevisaoMes}
      />

      <ConfirmDialog
        open={confirmGeracaoOpen}
        onOpenChange={setConfirmGeracaoOpen}
        title={`Gerar fechamento de ${mesLabel}/${ano}?`}
        description="A geração cria registros mensais para todos os clientes ativos ainda sem fechamento. Registros existentes serão ignorados."
        confirmLabel="Gerar fechamento"
        onConfirm={gerarFechamento}
      />

      {revisaoSalva ? (
        <InlineAlert
          tone="success"
          title="Revisão do mês registrada"
          description={
            `${new Date(revisaoSalva.revisadoEm).toLocaleString('pt-BR')} por ${revisaoSalva.nomeUsuario}` +
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

      {/* Table */}
      <div ref={tabelaRef} id="fechamento-tabela">
        {loading ? (
          <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/95">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <TableRowSkeleton cols={10} rows={8} />
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
