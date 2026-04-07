'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ArrowDownCircle } from 'lucide-react'

const FORMAS_PAGAMENTO = [
  { value: 'pix',          label: 'PIX' },
  { value: 'boleto',       label: 'Boleto' },
  { value: 'transferencia',label: 'Transferência' },
  { value: 'dinheiro',     label: 'Dinheiro' },
  { value: 'cartao',       label: 'Cartão' },
  { value: 'outro',        label: 'Outro' },
]

function toDateInputValue(date: Date) {
  const y  = date.getFullYear()
  const m  = String(date.getMonth() + 1).padStart(2, '0')
  const d  = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface LancamentoBaixarProps {
  lancamentoId: string
}

export function LancamentoBaixar({ lancamentoId }: LancamentoBaixarProps) {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [salvando, setSalvando]       = useState(false)
  const [dataPagamento, setDataPagamento] = useState(toDateInputValue(new Date()))
  const [formaPagamento, setFormaPagamento] = useState('pix')

  async function handleBaixar() {
    if (!dataPagamento) {
      toast.error('Informe a data de pagamento')
      return
    }

    setSalvando(true)
    try {
      const res = await fetch(`/api/lancamentos/${lancamentoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baixar: {
            dataPagamento,
            formaPagamento,
          },
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Erro ao baixar lançamento')
        return
      }

      toast.success('Lançamento baixado com sucesso!')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setSalvando(false)
    }
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
          {/* Data de pagamento */}
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

          {/* Forma de pagamento */}
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

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose render={<Button variant="outline" size="sm" disabled={salvando} />}>
              Cancelar
            </DialogClose>
            <Button size="sm" onClick={handleBaixar} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar baixa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
