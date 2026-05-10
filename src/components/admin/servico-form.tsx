'use client'

import { useState } from 'react'
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
import { AppModal } from '@/components/ui/app-modal'
import { Loader2, Plus, Pencil, Package2 } from 'lucide-react'
import { getErrorMessage } from '@/lib/error-message'
import { createServicoAdmin, updateServicoAdmin } from '@/features/admin/services'

const servicoSchema = z.object({
  codigo:      z.string().min(1, 'Código é obrigatório').max(30).toUpperCase(),
  nome:        z.string().min(2, 'Nome é obrigatório').max(100),
  descricao:   z.string().optional().nullable(),
  frequencia:  z.enum(['mensal', 'avulso', 'anual', 'trimestral']).default('mensal'),
  valorPadrao: z.number().min(0).optional().nullable(),
  ativo:       z.boolean().default(true),
})

type ServicoFormData = z.input<typeof servicoSchema>

interface ServicoFormProps {
  servico?:  Record<string, unknown>
  onSaved?:  () => void
}

export function ServicoForm({ servico, onSaved }: ServicoFormProps) {
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
          codigo:      (servico.codigo as string) ?? '',
          nome:        (servico.nome as string) ?? '',
          descricao:   (servico.descricao as string) ?? '',
          frequencia:  (servico.frequencia as ServicoFormData['frequencia']) ?? 'mensal',
          valorPadrao: servico.valorPadrao != null ? Number(servico.valorPadrao) : undefined,
          ativo:       servico.ativo !== false,
        }
      : {
          codigo:     '',
          frequencia: 'mensal',
          ativo:      true,
        },
  })

  async function onSubmit(data: ServicoFormData) {
    try {
      // Extract numeric part for ordering
      const codigoNumero = parseInt(data.codigo.replace(/\D/g, '') || '0', 10)

      if (isEditing) {
        await updateServicoAdmin(servico!.id as string, {
          ...data,
          codigoNumero,
        })
        toast.success('Serviço atualizado!')
      } else {
        await createServicoAdmin({
          ...data,
          codigoNumero,
        })
        toast.success('Serviço criado!')
      }
      setOpen(false)
      reset()
      onSaved?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel salvar o servico. Verifique codigo, valor e permissao de acesso.'))
    }
  }

  return (
    <>
      {isEditing ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Pencil className="w-4 h-4 mr-1" />
          Editar
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Novo Serviço
        </Button>
      )}

      <AppModal
        open={open}
        onOpenChange={setOpen}
        title={isEditing ? 'Editar Serviço' : 'Novo Tipo de Serviço'}
        description="Defina um código único, nome, valor padrão e frequência de cobrança."
        icon={<Package2 className="size-4" />}
        size="md"
      >
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

            {/* Código */}
            <div className="space-y-1.5">
              <Label htmlFor="codigo">
                Código interno <span className="text-destructive">*</span>
              </Label>
              <Input
                id="codigo"
                {...register('codigo')}
                disabled={isEditing}
                placeholder="Ex: CONT-MENSAL, IRPJ, FP-SIMPLES"
                className="font-mono uppercase"
              />
              <p className="text-[11px] text-muted-foreground">Identificador único, sem espaços. Não pode ser alterado após salvar.</p>
              {errors.codigo && (
                <p className="text-xs text-destructive">{errors.codigo.message}</p>
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
                  {...register('valorPadrao', {
                    setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
                  })}
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
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? 'Salvar Alterações' : 'Criar Serviço'}
              </Button>
            </div>
          </form>
      </AppModal>
    </>
  )
}
