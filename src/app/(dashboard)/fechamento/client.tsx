'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FechamentoTable } from '@/components/fechamento/fechamento-table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { RefreshCw, Plus, CheckCircle2, Clock, AlertCircle } from 'lucide-react'

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

interface Props {
  fechamentos: Array<Record<string, unknown>>
  mes: number
  ano: number
  regime: string
  mesLabel: string
  resumo: { total: number; enviados: number; pendentes: number; parciais: number }
}

export function FechamentoClientPage({ fechamentos: initial, mes, ano, regime, mesLabel, resumo }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [gerando, setGerando] = useState(false)
  const [data, setData] = useState(initial)

  function navigate(params: Record<string, string | number>) {
    const sp = new URLSearchParams({
      mes: String(mes),
      ano: String(ano),
      ...(regime ? { regime } : {}),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    })
    // Remove empty
    if (!sp.get('regime')) sp.delete('regime')
    startTransition(() => {
      router.push(`/fechamento?${sp.toString()}`)
      router.refresh()
    })
  }

  async function gerarFechamento() {
    setGerando(true)
    try {
      const res = await fetch('/api/fechamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes, ano, gerarParaTodos: true }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erro ao gerar fechamento'); return }
      toast.success(`${json.criados} registros gerados para ${mesLabel}/${ano}`)
      router.refresh()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setGerando(false)
    }
  }

  async function handleUpdate(id: string, field: string, value: string) {
    const res = await fetch(`/api/fechamento/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (!res.ok) {
      toast.error('Erro ao salvar')
      return
    }
    // Atualiza localmente sem reload
    setData((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    )
  }

  const fechamentosTyped = data as Array<{
    id: string
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
  }>

  const pct = resumo.total > 0 ? Math.round((resumo.enviados / resumo.total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fechamento Mensal</h2>
          <p className="text-sm text-muted-foreground">{mesLabel} / {ano}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { startTransition(() => router.refresh()) }}
            disabled={isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isPending ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={gerarFechamento} disabled={gerando}>
            <Plus className="w-4 h-4 mr-1" />
            {gerando ? 'Gerando...' : 'Gerar Fechamento'}
          </Button>
        </div>
      </div>

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
      {resumo.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{resumo.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Enviados</p>
                <p className="text-2xl font-bold text-green-700">{resumo.enviados}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-yellow-600 mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-700">{resumo.pendentes}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600 mt-1 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Parciais</p>
                <p className="text-2xl font-bold text-orange-700">{resumo.parciais}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress */}
      {resumo.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso do mês</span>
            <span>{pct}% concluído</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabela */}
      <FechamentoTable fechamentos={fechamentosTyped} onUpdate={handleUpdate} />
    </div>
  )
}
