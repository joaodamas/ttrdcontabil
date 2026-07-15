'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppModal } from '@/components/ui/app-modal'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus, Trash2, CheckCircle2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/error-message'
import { formatCurrency } from '@/lib/utils'
import { fetchClientes } from '@/features/clientes/services'
import type { ClienteRecord } from '@/features/clientes/types'
import { fetchProdutos, produtoParaItem, emitirNfeProduto, type EmitirNfeResult } from '@/features/produtos/services'
import type { ProdutoRecord } from '@/features/produtos/types'
import { ProdutoForm } from '@/components/produtos/produto-form'

type Linha = { produto: ProdutoRecord; quantidade: number; valorUnitario: number }

interface EmitirNfeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteId?: string
  onFinished?: () => void | Promise<void>
}

export function EmitirNfeModal({ open, onOpenChange, clienteId: initialClienteId, onFinished }: EmitirNfeModalProps) {
  const [clientes, setClientes] = useState<ClienteRecord[]>([])
  const [clienteId, setClienteId] = useState('')
  const [apenasProduto, setApenasProduto] = useState(true)
  const [produtos, setProdutos] = useState<ProdutoRecord[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)

  const [produtoSel, setProdutoSel] = useState('')
  const [qtd, setQtd] = useState('1')
  const [linhas, setLinhas] = useState<Linha[]>([])

  const [tomadorCnpj, setTomadorCnpj] = useState('')
  const [tomadorNome, setTomadorNome] = useState('')
  const [tomadorEmail, setTomadorEmail] = useState('')
  const [natureza, setNatureza] = useState('Venda de mercadoria')

  const [emitindo, setEmitindo] = useState(false)
  const [resultado, setResultado] = useState<EmitirNfeResult | null>(null)

  useEffect(() => {
    if (!open) return
    fetchClientes()
      .then(setClientes)
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar os clientes.')))
  }, [open])

  useEffect(() => {
    if (open) {
      setClienteId(initialClienteId ?? '')
      setLinhas([]); setProdutoSel(''); setResultado(null)
      setTomadorCnpj(''); setTomadorNome(''); setTomadorEmail(''); setNatureza('Venda de mercadoria')
      setApenasProduto(true)
    }
  }, [open, initialClienteId])

  // Se veio de fora com um cliente específico que não é 'produto' (ex: link direto
  // do cliente 360), não esconde ele por causa do filtro — desliga automaticamente.
  useEffect(() => {
    if (!initialClienteId || clientes.length === 0) return
    const cliente = clientes.find((c) => c.id === initialClienteId)
    if (cliente && cliente.categoriaFiscal !== 'produto') setApenasProduto(false)
  }, [initialClienteId, clientes])

  const clientesProduto = clientes.filter((c) => c.categoriaFiscal === 'produto')
  const clientesExibidos = apenasProduto ? clientesProduto : clientes

  const carregarProdutos = useCallback(() => {
    if (!clienteId) { setProdutos([]); return }
    setCarregandoProdutos(true)
    fetchProdutos({ clienteId })
      .then((ps) => setProdutos(ps.filter((p) => p.ativo !== false)))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar os produtos.')))
      .finally(() => setCarregandoProdutos(false))
  }, [clienteId])

  useEffect(() => {
    carregarProdutos()
    setLinhas([]); setProdutoSel('')
  }, [carregarProdutos])

  function adicionarLinha() {
    const p = produtos.find((x) => x.id === produtoSel)
    const quantidade = Number(qtd)
    if (!p) { toast.error('Selecione um produto.'); return }
    if (!quantidade || quantidade <= 0) { toast.error('Quantidade inválida.'); return }
    setLinhas((prev) => [...prev, { produto: p, quantidade, valorUnitario: Number(p.valorUnitario) || 0 }])
    setProdutoSel(''); setQtd('1')
  }

  function removerLinha(i: number) {
    setLinhas((prev) => prev.filter((_, idx) => idx !== i))
  }

  function setValorLinha(i: number, valor: number) {
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, valorUnitario: valor } : l)))
  }

  const total = linhas.reduce((s, l) => s + l.quantidade * l.valorUnitario, 0)

  async function emitir() {
    if (!clienteId) { toast.error('Selecione a empresa emissora.'); return }
    if (linhas.length === 0) { toast.error('Adicione ao menos um produto.'); return }
    if (!tomadorCnpj.replace(/\D/g, '') || !tomadorNome.trim()) { toast.error('Informe o CNPJ/CPF e o nome do destinatário.'); return }

    setEmitindo(true); setResultado(null)
    try {
      const res = await emitirNfeProduto({
        clienteId,
        naturezaOperacao: natureza || 'Venda de mercadoria',
        destino: 'internal',
        tomador: {
          cpfCnpj: tomadorCnpj.replace(/\D/g, ''),
          razaoSocial: tomadorNome.trim(),
          email: tomadorEmail.trim() || undefined,
        },
        itens: linhas.map((l) => produtoParaItem(l.produto, l.quantidade, l.valorUnitario)),
      })
      setResultado(res)
      if (res.sucesso) {
        toast.success(`NF-e emitida${res.numeroNfse ? ` — nº ${res.numeroNfse}` : ''}!`)
        await onFinished?.()
      } else {
        toast.error(res.erro ?? 'A emissão falhou.')
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível emitir a NF-e.'))
    } finally {
      setEmitindo(false)
    }
  }

  const clienteNome = (c: ClienteRecord) => String(c.razaoSocial ?? c.nomeFantasia ?? c.id)

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Emitir NF-e (produto)"
      description="Selecione a empresa, os produtos do catálogo e o destinatário."
      icon={<Receipt className="size-4" />}
      size="lg"
    >
      <div className="space-y-4">
        <Card className="border-border/65 bg-card/95 p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Empresa emissora <span className="text-destructive">*</span></Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <Switch checked={apenasProduto} onCheckedChange={setApenasProduto} className="scale-75" />
                Só clientes com produto ({clientesProduto.length})
              </label>
            </div>
            <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clientesExibidos.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    Nenhum cliente classificado como &quot;produto&quot; — desligue o filtro acima.
                  </div>
                ) : (
                  clientesExibidos.map((c) => <SelectItem key={c.id} value={c.id}>{clienteNome(c)}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>

          {clienteId && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Produtos <span className="text-destructive">*</span></Label>
                <ProdutoForm clienteId={clienteId} onSaved={carregarProdutos} />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select value={produtoSel} onValueChange={(v) => setProdutoSel(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue placeholder={carregandoProdutos ? 'Carregando...' : (produtos.length ? 'Escolha um produto' : 'Nenhum produto no catálogo — cadastre um acima')} />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{String(p.codigo ?? '')} · {String(p.descricao ?? '')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input type="number" min="1" step="1" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="Qtd" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={adicionarLinha}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>

              {linhas.length > 0 && (
                <div className="overflow-x-auto rounded-lg border mt-2">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left section-label">Produto</th>
                        <th className="px-3 py-2 text-right section-label">Qtd</th>
                        <th className="px-3 py-2 text-right section-label">Valor un.</th>
                        <th className="px-3 py-2 text-right section-label">Subtotal</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {linhas.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{String(l.produto.descricao ?? l.produto.codigo ?? '')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.quantidade}</td>
                          <td className="px-3 py-2 text-right">
                            <Input type="number" step="0.01" min="0" value={l.valorUnitario}
                              onChange={(e) => setValorLinha(i, Number(e.target.value))} className="h-7 w-24 ml-auto text-right font-mono" />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(l.quantidade * l.valorUnitario)}</td>
                          <td className="px-3 py-2 text-right">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removerLinha(i)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {clienteId && (
            <div className="space-y-3 border-t pt-4">
              <Label>Destinatário (tomador) <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="CNPJ ou CPF" value={tomadorCnpj} onChange={(e) => setTomadorCnpj(e.target.value)} />
                <Input placeholder="Razão social / nome" value={tomadorNome} onChange={(e) => setTomadorNome(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="email" placeholder="E-mail (opcional)" value={tomadorEmail} onChange={(e) => setTomadorEmail(e.target.value)} />
                <Input placeholder="Natureza da operação" value={natureza} onChange={(e) => setNatureza(e.target.value)} />
              </div>
            </div>
          )}

          {clienteId && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">Total: <b className="text-foreground tabular-nums">{formatCurrency(total)}</b></div>
              <Button onClick={emitir} disabled={emitindo || linhas.length === 0}>
                {emitindo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Emitir NF-e
              </Button>
            </div>
          )}
        </Card>

        {resultado && (
          <Card className={`p-4 border ${resultado.sucesso ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}`}>
            {resultado.sucesso ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span><b>NF-e emitida</b>{resultado.numeroNfse ? ` — nº ${resultado.numeroNfse}` : ''}.</span>
              </div>
            ) : (
              <div className="text-sm">
                <p className="font-medium text-destructive">A emissão falhou{resultado.codigoErro ? ` (${resultado.codigoErro})` : ''}.</p>
                <p className="text-muted-foreground mt-1">{resultado.erro}</p>
              </div>
            )}
          </Card>
        )}
      </div>
    </AppModal>
  )
}
