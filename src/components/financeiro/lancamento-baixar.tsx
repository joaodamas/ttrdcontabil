'use client'

import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ArrowDownCircle, AlertTriangle } from 'lucide-react'
import { updateDocument } from '@/lib/firestore-client'
import { getErrorMessage } from '@/lib/error-message'
import { formatCurrency, formatDate, tsToDate } from '@/lib/utils'

const FORMAS_PAGAMENTO = [
  { value: 'pix',           label: 'PIX' },
  { value: 'boleto',        label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'dinheiro',      label: 'Dinheiro' },
  { value: 'cartao',        label: 'Cartão' },
  { value: 'outro',         label: 'Outro' },
]

function toDateInputValue(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface LancamentoBaixarProps {
  lancamentoId: string
  onBaixado?: () => void
  /** Contexto exibido no dialog para confirmação */
  valor?: number
  clienteNome?: string
  descricao?: string
  dataVencimento?: Timestamp
}

export function LancamentoBaixar({ lancamentoId, onBaixado, valor, clienteNome, descricao, dataVencimento }: LancamentoBaixarProps) {
  const altaValor = (valor ?? 0) > 500
  const [open, setOpen]                     = useState(false)
  const [confirmOpen, setConfirmOpen]       = useState(false)
  const [salvando, setSalvando]             = useState(false)
  const [dataPagamento, setDataPagamento]   = useState(toDateInputValue(new Date()))
  const [formaPagamento, setFormaPagamento] = useState('pix')

  async function handleBaixar() {
    if (!dataPagamento) {
      toast.error('Informe a data de pagamento')
      return
    }

    setSalvando(true)
    try {
      const [year, month, day] = dataPagamento.split('-').map(Number)
      const dataTs = Timestamp.fromDate(new Date(year, month - 1, day))

      await updateDocument('lancamentos', lancamentoId, {
        status: 'pago',
        dataPagamento: dataTs,
        formaPagamento,
      })

      const cliente = clienteNome?.trim() || 'Cliente'
      const valorLabel = valor != null ? formatCurrency(valor) : ''
      toast.success(`Baixa confirmada: ${cliente}${valorLabel ? ` · ${valorLabel}` : ''}`)
      setOpen(false)
      onBaixado?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível baixar o lançamento. Verifique permissão financeira e tente novamente.'))
    } finally {
      setSalvando(false)
    }
  }

  function handleConfirmarClick() {
    if (altaValor) {
      setConfirmOpen(true)
      return
    }
    void handleBaixar()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <ArrowDownCircle className="w-3 h-3 mr-1" />
            Baixar
          </Button>
        }
      />

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Baixar Lançamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Resumo do lançamento */}
          {(descricao || clienteNome || valor != null) && (
            <div className={`rounded-xl px-4 py-3 space-y-1 ${altaValor ? 'bg-warning/8 border border-warning/25' : 'bg-muted/60'}`}>
              {altaValor && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-warning mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Valor alto — confirme antes de baixar
                </div>
              )}
              {descricao && <p className="text-sm font-medium">{descricao}</p>}
              {clienteNome && <p className="text-xs text-muted-foreground">{clienteNome}</p>}
              {valor != null && (
                <p className={`text-base font-bold tabular-nums ${altaValor ? 'text-warning' : 'text-foreground'}`}>
                  {formatCurrency(valor)}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="dataPagamento">Data de Pagamento</Label>
            <Input
              id="dataPagamento"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              disabled={salvando}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Forma de Pagamento</Label>
            <Select
              value={formaPagamento}
              onValueChange={(v) => setFormaPagamento(v ?? 'pix')}
              disabled={salvando}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose render={<Button variant="outline" size="sm" disabled={salvando} />}>
              Cancelar
            </DialogClose>
            <Button size="sm" onClick={handleConfirmarClick} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar baixa
            </Button>
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar baixa de valor alto?</AlertDialogTitle>
            <AlertDialogDescription>
              Revise os dados antes de confirmar a baixa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-muted/60 px-3 py-2.5 space-y-1.5 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> {clienteNome ?? '—'}</p>
            <p><span className="text-muted-foreground">Descrição:</span> {descricao ?? '—'}</p>
            <p><span className="text-muted-foreground">Valor:</span> <span className="font-semibold text-warning">{valor != null ? formatCurrency(valor) : '—'}</span></p>
            <p><span className="text-muted-foreground">Vencimento:</span> {dataVencimento ? formatDate(tsToDate(dataVencimento)) : '—'}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleBaixar().then(() => setConfirmOpen(false))
              }}
              disabled={salvando}
            >
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar baixa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
