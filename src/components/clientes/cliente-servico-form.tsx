'use client'

import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { createDocument } from '@/lib/firestore-client'

const schema = z.object({
  servicoId: z.string().min(1, 'Selecione um serviço'),
  valor: z.number().positive('Valor deve ser positivo'),
  diaVencimento: z.number().int().min(1).max(31).optional().nullable(),
  dataInicio: z.string().min(1, 'Data de início é obrigatória'),
  dataFim: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

type FormData = z.input<typeof schema>

interface Servico {
  id: string
  nome: string
  valorPadrao: number | null
}

interface ClienteServicoFormProps {
  clienteId: string
  servicos: Servico[]
}

export function ClienteServicoForm({ clienteId, servicos }: ClienteServicoFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      dataInicio: new Date().toISOString().slice(0, 10),
    },
  })

  function handleServicoChange(servicoId: string) {
    const s = servicos.find((sv) => sv.id === servicoId)
    if (s?.valorPadrao) setValue('valor', s.valorPadrao)
  }

  async function onSubmit(data: FormData) {
    try {
      const servico = servicos.find((s) => s.id === data.servicoId)
      await createDocument('clientes_servicos', {
        clienteId,
        servicoId:    data.servicoId,
        servicoNome:  servico?.nome ?? null,
        valor:        data.valor,
        diaVencimento: data.diaVencimento ?? null,
        dataInicio:   data.dataInicio,
        dataFim:      data.dataFim ?? null,
        observacoes:  data.observacoes ?? null,
        status:       'ativo',
      })
      toast.success('Serviço adicionado!')
      router.push(`/clientes/${clienteId}`)
      router.refresh()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados do Serviço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Serviço */}
          <div className="space-y-1.5">
            <Label>
              Tipo de Serviço <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="servicoId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => {
                    field.onChange(v)
                    if (v) handleServicoChange(v)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.servicoId && (
              <p className="text-xs text-destructive">{errors.servicoId.message}</p>
            )}
          </div>

          {/* Valor + Dia Vencimento */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valor">
                Valor Mensal (R$) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                {...register('valor')}
              />
              {errors.valor && (
                <p className="text-xs text-destructive">{errors.valor.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diaVencimento">Dia de Vencimento</Label>
              <Input
                id="diaVencimento"
                type="number"
                min="1"
                max="31"
                placeholder="Ex: 10"
                {...register('diaVencimento')}
              />
            </div>
          </div>

          {/* Início + Fim */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dataInicio">
                Data de Início <span className="text-destructive">*</span>
              </Label>
              <Input id="dataInicio" type="date" {...register('dataInicio')} />
              {errors.dataInicio && (
                <p className="text-xs text-destructive">{errors.dataInicio.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataFim">Data de Encerramento</Label>
              <Input id="dataFim" type="date" {...register('dataFim')} />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Input
              id="observacoes"
              {...register('observacoes')}
              placeholder="Informações adicionais..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Adicionar Serviço
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
