'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableEmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Package, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/error-message'
import { formatCurrency } from '@/lib/utils'
import { fetchClientes } from '@/features/clientes/services'
import type { ClienteRecord } from '@/features/clientes/types'
import { fetchProdutos, updateProduto } from '@/features/produtos/services'
import type { ProdutoRecord } from '@/features/produtos/types'
import { ProdutoForm } from '@/components/produtos/produto-form'

export default function ProdutosPage() {
  const [clientes, setClientes] = useState<ClienteRecord[]>([])
  const [clienteId, setClienteId] = useState<string>('')
  const [produtos, setProdutos] = useState<ProdutoRecord[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [loading, setLoading] = useState(false)
  const [paraInativar, setParaInativar] = useState<ProdutoRecord | null>(null)

  useEffect(() => {
    fetchClientes()
      .then(setClientes)
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar os clientes.')))
      .finally(() => setLoadingClientes(false))
  }, [])

  const load = useCallback(() => {
    if (!clienteId) { setProdutos([]); return }
    setLoading(true)
    fetchProdutos({ clienteId })
      .then(setProdutos)
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar os produtos. Verifique sua permissão de acesso.')))
      .finally(() => setLoading(false))
  }, [clienteId])

  useEffect(() => { load() }, [load])

  async function handleInativar() {
    if (!paraInativar) return
    try {
      await updateProduto(paraInativar.id, { ativo: false })
      toast.success('Produto inativado.')
      load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível inativar o produto.'))
    } finally {
      setParaInativar(null)
    }
  }

  const clienteNome = (c: ClienteRecord) => String(c.razaoSocial ?? c.nomeFantasia ?? c.id)

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex flex-wrap items-end justify-between gap-3 border px-4 py-4 sm:px-5">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Catálogo de Produtos</h2>
          <p className="text-sm text-muted-foreground">Ficha fiscal por produto, para NF-e e NFC-e.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <p className="section-label">Empresa emissora</p>
            <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? '')}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={loadingClientes ? 'Carregando...' : 'Selecione o cliente'} />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{clienteNome(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {clienteId && <ProdutoForm clienteId={clienteId} onSaved={load} />}
        </div>
      </div>

      {!clienteId ? (
        <Card className="border-border/65 bg-card/95 card-shadow">
          <div className="py-16 text-center text-sm text-muted-foreground">
            Selecione a empresa emissora para ver e cadastrar os produtos dela.
          </div>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <Card className="border-border/65 bg-card/95 card-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left section-label">Código</th>
                  <th className="px-4 py-3 text-left section-label">Descrição</th>
                  <th className="px-4 py-3 text-left section-label">NCM</th>
                  <th className="px-4 py-3 text-left section-label">CFOP</th>
                  <th className="px-4 py-3 text-left section-label">Valor</th>
                  <th className="px-4 py-3 text-left section-label">Status</th>
                  <th className="px-4 py-3 text-left section-label">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {produtos.length === 0 ? (
                  <TableEmptyState
                    colSpan={7}
                    icon={Package}
                    title="Nenhum produto cadastrado"
                    description="Cadastre o primeiro produto com a ficha fiscal para emitir NF-e/NFC-e desta empresa."
                  />
                ) : (
                  produtos.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/35">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{String(p.codigo ?? '—')}</td>
                      <td className="px-4 py-3"><p className="font-medium">{String(p.descricao ?? '')}</p></td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{String(p.ncm ?? '—')}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{String(p.cfop ?? '—')}</td>
                      <td className="px-4 py-3">{p.valorUnitario != null ? formatCurrency(Number(p.valorUnitario)) : '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.ativo !== false ? 'default' : 'secondary'}>
                          {p.ativo !== false ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <ProdutoForm produto={p} onSaved={load} />
                          {p.ativo !== false && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => setParaInativar(p)}
                            >
                              <Ban className="mr-1 h-3 w-3" /> Inativar
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
      )}

      <ConfirmDialog
        open={!!paraInativar}
        onOpenChange={(o) => { if (!o) setParaInativar(null) }}
        title="Inativar produto?"
        description={`O produto "${String(paraInativar?.descricao ?? '')}" ficará indisponível para novas emissões.`}
        confirmLabel="Inativar"
        destructive
        onConfirm={handleInativar}
      />
    </div>
  )
}
