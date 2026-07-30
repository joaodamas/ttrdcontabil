'use client'

import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { createDocument } from '@/lib/firestore-client'
import { getErrorMessage } from '@/lib/error-message'
import { formatServiceLabel } from '@/lib/service-label'

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
  codigo?: string | null
  valorPadrao: number | null
  // Vem do catálogo (servicos.frequencia) e precisa ser COPIADA para o
  // contrato: o gerador de cobrança lê clientes_servicos, nunca o catálogo.
  // Sem ela, serviço anual (IRPF) ou avulso (abertura de empresa) era
  // faturado todo mês, para sempre.
  frequencia?: 'mensal' | 'avulso' | 'anual' | 'trimestral'
}

interface ClienteServicoFormProps {
  clienteId: string
  clienteNome?: string
  servicos: Servico[]
  mode?: 'page' | 'modal'
  onSaved?: () => void
  onCancel?: () => void
}

export function ClienteServicoForm({
  clienteId,
  clienteNome,
  servicos,
  mode = 'page',
  onSaved,
  onCancel,
}: ClienteServicoFormProps) {
  const router = useRouter()
  const isModal = mode === 'modal'

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
      const servicoNome = formatServiceLabel(servico)
      await createDocument('clientes_servicos', {
        clienteId,
        clienteNome:  clienteNome ?? null,
        servicoId:    data.servicoId,
        servicoNome,
        servicoCodigo: servico?.codigo ?? null,
        // Default 'mensal' só quando o catálogo não disser nada: é o
        // comportamento que já valia na prática, e não muda contrato existente.
        frequencia:   servico?.frequencia ?? 'mensal',
        valor:        data.valor,
        diaVencimento: data.diaVencimento ?? null,
        dataInicio:   Timestamp.fromDate(new Date(`${data.dataInicio}T12:00:00`)),
        dataFim:      data.dataFim ? Timestamp.fromDate(new Date(`${data.dataFim}T12:00:00`)) : null,
        observacoes:  data.observacoes ?? null,
        status:       'ativo',
      })
      toast.success('Serviço adicionado!')
      onSaved?.()
      if (!isModal) router.push(`/clientes/${clienteId}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível vincular o serviço. Verifique valor, datas e permissões.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card className={cn(isModal && 'border-border/70 shadow-none')}>
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
              render={({ field }) => {
                  const selected = servicos.find((s) => s.id === field.value)
                  return (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => {
                        field.onChange(v)
                        if (v) handleServicoChange(v)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <span className={selected ? 'truncate text-left' : 'truncate text-left text-muted-foreground'}>
                          {selected ? formatServiceLabel(selected) : 'Selecione o serviço'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {servicos.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-muted-foreground">
                            Nenhum serviço cadastrado ativo.
                          </div>
                        ) : (
                          servicos.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {formatServiceLabel(s)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )
                }}
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
                {...register('valor', { valueAsNumber: true })}
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
                {...register('diaVencimento', { valueAsNumber: true })}
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
        <Button type="button" variant="outline" onClick={() => onCancel?.() ?? router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
