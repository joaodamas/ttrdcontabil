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

const tarefaSchema = z.object({
  clienteId:     z.string().optional().nullable(),
  competenciaId: z.string().optional().nullable(),
  titulo:        z.string().min(1, 'Título é obrigatório').max(200),
  descricao:     z.string().optional().nullable(),
  prioridade:    z.enum(['baixa', 'normal', 'alta', 'urgente']).default('normal'),
  status:        z.enum(['pendente', 'em_andamento', 'concluida', 'cancelada']).default('pendente'),
  responsavelId: z.string().optional().nullable(),
  dataPrazo:     z.string().optional().nullable(),
})

type TarefaFormData = z.input<typeof tarefaSchema>

interface ClienteItem { id: string; razaoSocial: string }
interface UsuarioItem { id: string; nome: string }

interface TarefaFormProps {
  initialData?: Partial<TarefaFormData> & { id?: string }
  onSuccess?: (id: string) => void
  onClose?: () => void
}

export function TarefaForm({ initialData, onSuccess, onClose }: TarefaFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id

  const [clientes, setClientes] = useState<ClienteItem[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])
  const [loading, setLoading]   = useState(true)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TarefaFormData>({
    resolver: zodResolver(tarefaSchema),
    defaultValues: { prioridade: 'normal', status: 'pendente', ...initialData },
  })

  useEffect(() => {
    Promise.allSettled([
      getClientes({ status: 'ativo' }),
      getUsuarios(),
    ]).then(([rc, ru]) => {
      if (rc.status === 'fulfilled') setClientes(rc.value as unknown as ClienteItem[])
      if (ru.status === 'fulfilled') setUsuarios(ru.value as unknown as UsuarioItem[])
      setLoading(false)
    })
  }, [])

  async function onSubmit(data: TarefaFormData) {
    try {
      if (isEditing) {
        await updateDocument('tarefas', initialData!.id!, data)
        toast.success('Tarefa atualizada!')
        if (onSuccess) onSuccess(initialData!.id!)
        else { router.push('/tarefas'); router.refresh() }
      } else {
        const id = await createDocument('tarefas', data)
        toast.success('Tarefa criada!')
        if (onSuccess) onSuccess(id)
        else { router.push('/tarefas'); router.refresh() }
      }
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados da Tarefa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título <span className="text-destructive">*</span></Label>
            <Input id="titulo" {...register('titulo')} placeholder="Descreva brevemente a tarefa" />
            {errors.titulo && <p className="text-xs text-destructive">{errors.titulo.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" rows={3} placeholder="Detalhes adicionais..." {...register('descricao')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Controller
                name="prioridade"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione o cliente'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Controller
              name="responsavelId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione o responsável'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dataPrazo">Data Prazo</Label>
            <Input id="dataPrazo" type="date" {...register('dataPrazo')} className="max-w-48" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Tarefa'}
        </Button>
        <Button type="button" variant="outline" onClick={() => onClose ? onClose() : router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
