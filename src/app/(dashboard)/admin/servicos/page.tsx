'use client'

import { useState, useEffect, useCallback } from 'react'

import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TableEmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ServicoForm } from '@/components/admin/servico-form'
import { Loader2, ChevronUp, ChevronDown, ChevronsUpDown, BriefcaseBusiness, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/error-message'
import { fetchServicosAdmin, gerarTabelaCobAdmin, updateServicoAdmin } from '@/features/admin/services'
import type { ServicoAdmin } from '@/features/admin/types'

type SortKey = 'codigo' | 'nome' | 'frequencia' | 'valorPadrao' | 'ativo'
type SortDir = 'asc' | 'desc'

const FREQUENCIA_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  avulso: 'Avulso',
  anual: 'Anual',
  trimestral: 'Trimestral',
}

export default function AdminServicosPage() {
  const [servicos, setServicos] = useState<ServicoAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('codigo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [servicoParaInativar, setServicoParaInativar] = useState<ServicoAdmin | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchServicosAdmin()
      .then(setServicos)
      .catch((err) => toast.error(getErrorMessage(err, 'Nao foi possivel carregar os servicos cadastrados. Verifique sua permissao de acesso.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...servicos].sort((a, b) => {
    let av: unknown = a[sortKey]
    let bv: unknown = b[sortKey]
    if (sortKey === 'ativo') { av = a.ativo ? 1 : 0; bv = b.ativo ? 1 : 0 }
    if (sortKey === 'valorPadrao') { av = (a.valorPadrao as number) ?? 0; bv = (b.valorPadrao as number) ?? 0 }
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av
    }
    const as = String(av ?? '').toLowerCase()
    const bs = String(bv ?? '').toLowerCase()
    return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
  })

  async function handleInativarServico() {
    if (!servicoParaInativar) return
    try {
      await updateServicoAdmin(servicoParaInativar.id, { ativo: false })
      toast.success('Serviço inativado.')
      load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel inativar o servico.'))
    } finally {
      setServicoParaInativar(null)
    }
  }

  async function gerarTabelaCob() {
    setGerando(true)
    try {
      await gerarTabelaCobAdmin()
      toast.success('Tabela COB01–COB20 criada com sucesso!')
      load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel gerar a tabela COB. Verifique se ja existem servicos cadastrados e tente novamente.'))
    } finally {
      setGerando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Tipos de Serviço</h2>
          <p className="text-sm text-muted-foreground">
            {servicos.length} serviço{servicos.length !== 1 ? 's' : ''} cadastrado{servicos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {servicos.length === 0 && (
            <button
              onClick={gerarTabelaCob}
              disabled={gerando}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              {gerando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Gerar Tabela COB01–COB20
            </button>
          )}
          <ServicoForm onSaved={load} />
        </div>
      </div>

      <Card className="border-border/65 bg-card/95 card-shadow">
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {(
                  [
                    { key: 'codigo',     label: 'Código' },
                    { key: 'nome',       label: 'Nome' },
                    { key: 'frequencia', label: 'Frequência' },
                    { key: 'valorPadrao',label: 'Valor Padrão' },
                    { key: 'ativo',      label: 'Status' },
                  ] as { key: SortKey; label: string }[]
                ).map(({ key, label }) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-left section-label select-none cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortKey === key ? (
                        sortDir === 'asc'
                          ? <ChevronUp className="w-3.5 h-3.5" />
                          : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left section-label">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  icon={BriefcaseBusiness}
                  title="Nenhum serviço cadastrado"
                  description="Gere a tabela COB inicial ou cadastre um serviço manualmente para conseguir vincular clientes e gerar competências."
                  action={{ label: gerando ? 'Gerando...' : 'Gerar Tabela COB01-COB20', onClick: () => { void gerarTabelaCob() } }}
                />
              ) : (
                sorted.map((s) => (
                  <tr key={s.id as string} className="transition-colors hover:bg-muted/35">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {(s.codigo as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{s.nome as string}</p>
                        {s.descricao ? (
                          <p className="text-xs text-muted-foreground">{s.descricao as string}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {FREQUENCIA_LABELS[s.frequencia as string] ?? (s.frequencia as string)}
                    </td>
                    <td className="px-4 py-3">
                      {s.valorPadrao ? formatCurrency(s.valorPadrao as number) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.ativo ? 'default' : 'secondary'}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <ServicoForm servico={s} onSaved={load} />
                        {s.ativo && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setServicoParaInativar(s)}
                          >
                            <Ban className="mr-1 h-3 w-3" />
                            Inativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!servicoParaInativar}
        onOpenChange={(open) => { if (!open) setServicoParaInativar(null) }}
        title="Inativar serviço?"
        description={`O serviço "${servicoParaInativar?.nome ?? ''}" ficará indisponível para novos vínculos com clientes. Vínculos já existentes não são encerrados automaticamente.`}
        confirmLabel="Inativar"
        destructive
        onConfirm={handleInativarServico}
      />
    </div>
  )
}
