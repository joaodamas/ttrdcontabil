'use client'

import { useState, useEffect } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { getClientes, getUsuarios, createDocument, updateDocument } from '@/lib/firestore-client'
import { Timestamp } from 'firebase/firestore'
import { getErrorMessage } from '@/lib/error-message'
import { SELECT_NONE_VALUE } from '@/lib/select-values'

const irSchema = z.object({
  clienteId: z.string().min(1, 'Cliente é obrigatório'),
  anoBase: z.number().int().min(2000).max(2100),
  status: z
    .enum(['pendente', 'em_andamento', 'entregue', 'retificado', 'cancelado'])
    .default('pendente'),
  responsavelId: z.string().optional().nullable(),
  dataEntrega: z.string().optional().nullable(),
  numeroRecibo: z.string().max(50).optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

type IrFormData = z.input<typeof irSchema>

interface Cliente {
  id: string
  razaoSocial: string
}

interface Usuario {
  id: string
  nome: string
}

const CHECKLIST_IR_PADRAO = [
  'Informe de rendimentos',
  'Comprovantes de despesas médicas',
  'Comprovantes de educação',
  'Informe de bancos e investimentos',
  'Comprovantes de bens, dívidas e financiamentos',
  'Recibos de aluguéis ou rendimentos recebidos',
]

interface IrFormProps {
  initialData?: Partial<IrFormData> & { id?: string }
}

export function IrForm({ initialData }: IrFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<IrFormData>({
    resolver: zodResolver(irSchema),
    defaultValues: {
      status: 'pendente',
      anoBase: new Date().getFullYear() - 1,
      ...initialData,
    },
  })

  useEffect(() => {
    Promise.allSettled([
      getClientes({ status: 'ativo' }),
      getUsuarios(),
    ]).then(([rc, ru]) => {
      if (rc.status === 'fulfilled') setClientes(rc.value as unknown as Cliente[])
      if (ru.status === 'fulfilled') setUsuarios(ru.value as unknown as Usuario[])
    }).finally(() => setLoading(false))
  }, [])

  async function onSubmit(data: IrFormData) {
    try {
      const cliente = clientes.find((c) => c.id === data.clienteId)
      const responsavel = usuarios.find((u) => u.id === data.responsavelId)
      const payload = {
        ...data,
        clienteNome: cliente?.razaoSocial ?? null,
        responsavelNome: responsavel?.nome ?? null,
        dataEntrega: data.dataEntrega ? Timestamp.fromDate(new Date(`${data.dataEntrega}T12:00:00`)) : null,
      }

      if (isEditing) {
        await updateDocument('ir_declaracoes', initialData!.id!, payload as Record<string, unknown>)
        toast.success('Declaração atualizada!')
        router.push(`/ir/${initialData!.id}`)
      } else {
        const id = await createDocument('ir_declaracoes', payload as Record<string, unknown>)
        await Promise.all([
          ...CHECKLIST_IR_PADRAO.map((descricao, index) =>
            createDocument('ir_checklist', {
              declaracaoId: id,
              clienteId: data.clienteId,
              clienteNome: cliente?.razaoSocial ?? null,
              descricao,
              ordem: index + 1,
              recebido: false,
            })
          ),
          createDocument('tarefas', {
            titulo: `Coletar documentos IR ${data.anoBase} - ${cliente?.razaoSocial ?? 'cliente'}`,
            clienteId: data.clienteId,
            clienteNome: cliente?.razaoSocial ?? null,
            responsavelId: data.responsavelId ?? null,
            responsavelNome: responsavel?.nome ?? null,
            prioridade: 'alta',
            status: 'pendente',
            dataPrazo: Timestamp.fromDate(new Date(data.anoBase + 1, 3, 15, 12, 0, 0)),
            origem: 'ir_declaracao',
            origemId: id,
          }),
        ])
        toast.success('Declaração criada!')
        router.push(`/ir/${id}`)
      }
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel salvar a declaracao de IR. Verifique cliente, responsavel e permissao de acesso.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados da Declaração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>
              Cliente <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  disabled={loading || isEditing}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loading ? 'Carregando...' : 'Selecione o cliente'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.razaoSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clienteId && (
              <p className="text-xs text-destructive">{errors.clienteId.message}</p>
            )}
            {isEditing && (
              <p className="text-xs text-muted-foreground">O cliente não pode ser alterado.</p>
            )}
          </div>

          {/* Ano Base + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="anoBase">
                Ano-Calendário <span className="text-destructive">*</span>
              </Label>
              <Input
                id="anoBase"
                type="number"
                min="2000"
                max="2100"
                {...register('anoBase', { valueAsNumber: true })}
              />
              {errors.anoBase && (
                <p className="text-xs text-destructive">{errors.anoBase.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="entregue">Entregue</SelectItem>
                      <SelectItem value="retificado">Retificado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Responsável */}
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Controller
              name="responsavelId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? SELECT_NONE_VALUE}
                  onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? null : v)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loading ? 'Carregando...' : 'Selecione o responsável'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>Nenhum</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Data Entrega + Nº Recibo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dataEntrega">Data de Entrega</Label>
              <Input id="dataEntrega" type="date" {...register('dataEntrega')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="numeroRecibo">Nº do Recibo</Label>
              <Input
                id="numeroRecibo"
                {...register('numeroRecibo')}
                placeholder="Ex: 12345.67890.12345"
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              rows={3}
              {...register('observacoes')}
              placeholder="Informações adicionais..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Declaração'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
