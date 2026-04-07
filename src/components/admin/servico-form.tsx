'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from '@radix-ui/react-dialog'
import { Loader2, Plus, Pencil, X } from 'lucide-react'

const servicoSchema = z.object({
  nome: z.string().min(2, 'Nome é obrigatório').max(100),
  descricao: z.string().optional().nullable(),
  frequencia: z.enum(['mensal', 'avulso', 'anual', 'trimestral']).default('mensal'),
  valorPadrao: z.number().min(0).optional().nullable(),
  ativo: z.boolean().default(true),
})

type ServicoFormData = z.input<typeof servicoSchema>

interface ServicoFormProps {
  servico?: Record<string, unknown>
}

export function ServicoForm({ servico }: ServicoFormProps) {
  const router = useRouter()
  const isEditing = !!servico?.id
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ServicoFormData>({
    resolver: zodResolver(servicoSchema),
    defaultValues: isEditing
      ? {
          nome: (servico.nome as string) ?? '',
          descricao: (servico.descricao as string) ?? '',
          frequencia: (servico.frequencia as ServicoFormData['frequencia']) ?? 'mensal',
          valorPadrao: servico.valorPadrao != null ? Number(servico.valorPadrao) : undefined,
          ativo: servico.ativo !== false,
        }
      : {
          frequencia: 'mensal',
          ativo: true,
        },
  })

  async function onSubmit(data: ServicoFormData) {
    try {
      const url = isEditing ? `/api/servicos/${servico!.id}` : '/api/servicos'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao salvar serviço')
        return
      }

      toast.success(isEditing ? 'Serviço atualizado!' : 'Serviço criado!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button size="sm" variant="ghost">
            <Pencil className="w-4 h-4 mr-1" />
            Editar
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Novo Serviço
          </Button>
        )}
      </DialogTrigger>

      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-40" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background rounded-lg shadow-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              {isEditing ? 'Editar Serviço' : 'Novo Tipo de Serviço'}
            </DialogTitle>
            <DialogClose asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                {...register('nome')}
                placeholder="Ex: Contabilidade Mensal, IRPJ, Folha de Pagamento..."
              />
              {errors.nome && (
                <p className="text-xs text-destructive">{errors.nome.message}</p>
              )}
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                rows={2}
                {...register('descricao')}
                placeholder="Descrição opcional do serviço..."
              />
            </div>

            {/* Frequência + Valor Padrão */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Controller
                  name="frequencia"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="avulso">Avulso</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valorPadrao">Valor Padrão (R$)</Label>
                <Input
                  id="valorPadrao"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  {...register('valorPadrao')}
                />
                {errors.valorPadrao && (
                  <p className="text-xs text-destructive">{errors.valorPadrao.message}</p>
                )}
              </div>
            </div>

            {/* Status (only on edit) */}
            {isEditing && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="ativo"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? 'ativo' : 'inativo'}
                      onValueChange={(v) => field.onChange(v === 'ativo')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? 'Salvar Alterações' : 'Criar Serviço'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
