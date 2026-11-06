'use client'

import { useState, useEffect, useTransition, useCallback, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { FechamentoTable } from '@/components/fechamento/fechamento-table'
import { FechamentoPendenciasCards } from '@/components/fechamento/fechamento-pendencias-cards'
import { PageHeader } from '@/components/layout/page-header'
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
import { RefreshCw, Plus, CheckCircle2, Clock, ListChecks, ClipboardList, LockOpen } from 'lucide-react'
import {
  updateFechamentoField,
  gerarFechamentoMensal,
  salvarRevisao,
  buscarRevisao,
  reabrirMes,
  type RevisaoRecord,
} from '@/features/fechamento/services'
import { fechamentoFiltroSchema } from '@/features/fechamento/schemas'
import { useFechamentoList } from '@/features/fechamento/hooks'
import { fechamentoKeys } from '@/features/fechamento/queries'
import { getErrorMessage } from '@/lib/error-message'
import { podeEscreverEm } from '@/lib/permissions'
import { resumirFechamentos, temPendencia } from '@/lib/fechamento-resumo'
import type { FechamentoFilters, FechamentoRecord } from '@/features/fechamento/types'
import { FiltrosAtivos } from '@/components/ui/filtros-ativos'
import { useNomeCliente } from '@/lib/use-nomes-filtro'
import { hrefSemFiltro } from '@/lib/url-filtros'

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
  // ?clienteId= vem dos badges de bloqueio do "Hoje": mostra só aquele cliente
  // (filtro local — o mês inteiro já é uma leitura só) com chip removível.
  const clienteId = searchParams.get('clienteId') ?? ''
  const mesLabel = MESES.find((m) => m.value === mes)?.label ?? ''

  const [fechamentos, setFechamentos] = useState<FechamentoRecord[]>([])
  const { fechamentos: fechamentosData, isLoading: loading, isError, error, refetch } = useFechamentoList(parsed)
  const { usuario } = useAuth()
  const [gerando, setGerando] = useState(false)
  const [confirmGeracaoOpen, setConfirmGeracaoOpen] = useState(false)
  const [revisaoDialogOpen, setRevisaoDialogOpen] = useState(false)
  const [revisaoNota, setRevisaoNota] = useState('')
  const [revisaoSalva, setRevisaoSalva] = useState<RevisaoRecord | null>(null)
  const [revisaoLoading, setRevisaoLoading] = useState(false)
  const [confirmRevisaoOpen, setConfirmRevisaoOpen] = useState(false)
  const [confirmReabrirOpen, setConfirmReabrirOpen] = useState(false)
  const [reabrindo, setReabrindo] = useState(false)
  const travado = revisaoSalva?.travado === true
  const isAdmin = usuario?.perfil === 'admin'
  const podeGerar = podeEscreverEm(usuario, 'fechamento')

  useEffect(() => {
    setRevisaoLoading(true)
    buscarRevisao(ano, mes)
      .then(setRevisaoSalva)
      .catch(() => setRevisaoSalva(null))
      .finally(() => setRevisaoLoading(false))
  }, [ano, mes])

  useEffect(() => {
    const todos = fechamentosData as FechamentoRecord[]
    setFechamentos(clienteId ? todos.filter((f) => f.clienteId === clienteId) : todos)
  }, [fechamentosData, clienteId])
  const nomeCliente = useNomeCliente(clienteId, fechamentos.find((f) => f.clienteId === clienteId)?.clienteNome)

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
      ...(clienteId ? { clienteId } : {}),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    })
    if (!sp.get('regime')) sp.delete('regime')
    if (!sp.get('clienteId')) sp.delete('clienteId')
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
      toast.error(getErrorMessage(err, 'Não foi possível gerar o fechamento. Tente novamente.'))
    } finally {
      setGerando(false)
    }
  }

  const handleUpdate = useCallback(async (id: string, field: string, value: string) => {
    try {
      await updateFechamentoField(id, field, value, ano, mes)
      setFechamentos((prev) =>
        prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
      )
      await queryClient.invalidateQueries({ queryKey: fechamentoKeys.list(parsed) })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o status do fechamento. Atualize a tela e tente novamente.'))
    }
  }, [ano, mes, parsed, queryClient])

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

  async function reabrirMesAtual() {
    setReabrindo(true)
    try {
      await reabrirMes(ano, mes, usuario?.uid ?? '', usuario?.nome ?? usuario?.email ?? 'Usuário')
      setRevisaoSalva(await buscarRevisao(ano, mes))
      toast.success(`Mês de ${mesLabel}/${ano} reaberto para edição.`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível reabrir o mês. Verifique permissões e tente novamente.'))
    } finally {
      setReabrindo(false)
      setConfirmReabrirOpen(false)
    }
  }

  // Resumo — uma única definição de pendência (ver lib/fechamento-resumo).
  const resumo = resumirFechamentos(fechamentos)
  const total = resumo.totalClientes
  // O snapshot da revisão (auditoria) continua registrando a contagem do DAS.
  const { enviados, pendentes, parciais } = resumo.das
  const pct = resumo.pctConcluido
  const statusSnapshot = fechamentos.reduce<Record<string, number>>((acc, fechamento) => {
    for (const field of ['dasStatus', 'esocialStatus', 'reinfStatus', 'fgtsStatus'] as const) {
      const key = `${field}:${fechamento[field]}`
      acc[key] = (acc[key] ?? 0) + 1
    }
    return acc
  }, {})
  const fechamentosComPendencia = fechamentos.filter(temPendencia)
  const totalObrigacoesPendentes = resumo.obrigacoesEmAberto

  return (
    <div className="stack-6">
      <PageHeader
        title="Fechamento mensal"
        description={`${mesLabel} / ${ano}`}
        action={
          <>
          <Button
            variant="outline"
            size="cta"
            onClick={() => { startTransition(() => load()) }}
            disabled={isPending || loading}
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Atualizar
          </Button>
          {travado ? (
            isAdmin ? (
              <Button
                variant="outline"
                size="cta"
                onClick={() => setConfirmReabrirOpen(true)}
                disabled={loading || revisaoLoading || reabrindo}
              >
                <LockOpen />
                {reabrindo ? 'Reabrindo...' : 'Reabrir mês'}
              </Button>
            ) : null
          ) : (
            <Button
              variant="outline"
              size="cta"
              onClick={() => setRevisaoDialogOpen(true)}
              // A revisão trava o mês INTEIRO (id ano_mes), mas o snapshot sai da
              // lista na tela — com regime filtrado ele registraria só parte.
              disabled={loading || revisaoLoading || Boolean(regime) || Boolean(clienteId)}
              title={regime || clienteId ? 'Remova os filtros de regime e cliente para encerrar a revisão do mês inteiro.' : undefined}
            >
              <ClipboardList />
              Encerrar revisão do mês
            </Button>
          )}
          {podeGerar ? (
            <Button size="cta" onClick={() => setConfirmGeracaoOpen(true)} disabled={gerando || loading}>
              <Plus />
              {gerando ? 'Gerando...' : 'Gerar fechamento'}
            </Button>
          ) : null}
          </>
        }
      />

      <Dialog open={revisaoDialogOpen} onOpenChange={setRevisaoDialogOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Encerrar revisão de {mesLabel} / {ano}</DialogTitle>
            <DialogDescription>
              A revisão fica registrada com usuário, data e observação, para consulta futura do fechamento.
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
            : 'A revisão fica registrada com usuário, data e observação, para consulta futura do fechamento.'
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

      <ConfirmDialog
        open={confirmReabrirOpen}
        onOpenChange={setConfirmReabrirOpen}
        title={`Reabrir ${mesLabel}/${ano} para edição?`}
        description="A trava de revisão será removida e os status dos fechamentos voltam a ficar editáveis. O histórico da revisão anterior é mantido para auditoria."
        confirmLabel="Reabrir mês"
        cancelLabel="Cancelar"
        onConfirm={reabrirMesAtual}
      />

      {revisaoSalva && travado ? (
        <InlineAlert
          tone="success"
          title="Mês revisado — travado"
          description={
            `Revisado em ${new Date(revisaoSalva.revisadoEm).toLocaleString('pt-BR')} por ${revisaoSalva.nomeUsuario}` +
            (revisaoSalva.nota ? ` — ${revisaoSalva.nota}` : '') +
            '. Edição de status bloqueada' +
            (isAdmin ? ' — use "Reabrir mês" para liberar.' : '. Apenas um admin pode reabrir este mês.')
          }
        />
      ) : null}

      {revisaoSalva && !travado ? (
        <InlineAlert
          tone="info"
          title="Mês reaberto para edição"
          description={
            `Reaberto em ${new Date(revisaoSalva.reabertoEm ?? revisaoSalva.revisadoEm).toLocaleString('pt-BR')}` +
            (revisaoSalva.reabertoPorNome ? ` por ${revisaoSalva.reabertoPorNome}` : '') +
            `. Revisão anterior: ${new Date(revisaoSalva.revisadoEm).toLocaleString('pt-BR')} por ${revisaoSalva.nomeUsuario}.`
          }
        />
      ) : null}

      {resumo.clientesComPendencia > 0 && (
        <InlineAlert
          tone="warning"
          title={`${resumo.clientesComPendencia} de ${total} cliente(s) com pendência de fechamento`}
          description={`${totalObrigacoesPendentes} obrigação(ões) em aberto (pendente, parcial ou com guia) entre DAS, eSocial, Reinf e FGTS. Os clientes estão listados logo abaixo.`}
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
              <p className="text-xs text-muted-foreground">Clientes no mês</p>
              <p className="text-2xl font-bold tabular-nums">{total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-success mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Clientes em dia</p>
                <p className="text-2xl font-bold tabular-nums text-success">{resumo.clientesEmDia}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-warning mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Clientes com pendência</p>
                <p className="text-2xl font-bold tabular-nums text-amber-800 dark:text-warning">{resumo.clientesComPendencia}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <ListChecks className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Obrigações em aberto</p>
                <p className="text-2xl font-bold tabular-nums">{totalObrigacoesPendentes}</p>
                <p className="text-[11px] text-muted-foreground">de {resumo.obrigacoesAplicaveis} aplicáveis</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso do mês — {resumo.obrigacoesConcluidas} de {resumo.obrigacoesAplicaveis} obrigações concluídas</span>
            <span>{pct}%</span>
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
          travado={travado}
          onIrParaTabela={() =>
            tabelaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      ) : null}

      <FiltrosAtivos
        chips={[
          clienteId && { chave: 'clienteId', rotulo: 'Cliente', valor: nomeCliente, removerHref: hrefSemFiltro('/fechamento', searchParams, ['clienteId']) },
          regime && { chave: 'regime', rotulo: 'Regime', valor: REGIMES.find((r) => r.value === regime)?.label ?? regime, removerHref: hrefSemFiltro('/fechamento', searchParams, ['regime']) },
        ]}
        limparHref={`/fechamento?mes=${mes}&ano=${ano}`}
      />

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
        ) : isError ? (
          <InlineAlert
            tone="danger"
            title="Não foi possível carregar os fechamentos"
            description={getErrorMessage(error, 'Verifique sua conexão e suas permissões, e tente novamente.')}
            action={{ label: 'Tentar novamente', onClick: () => { void refetch() } }}
          />
        ) : (
          <FechamentoTable fechamentos={fechamentos} onUpdate={handleUpdate} travado={travado} />
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
