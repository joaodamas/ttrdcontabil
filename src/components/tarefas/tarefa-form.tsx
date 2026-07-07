'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Timestamp } from 'firebase/firestore'
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
import { getErrorMessage } from '@/lib/error-message'
import { SELECT_NONE_VALUE } from '@/lib/select-values'
import { toDateInputValue } from '@/lib/form-dates'
import { useAuth } from '@/contexts/auth-context'
import { opcoesStatusTarefa, tarefaPodeTransicionar } from '@/lib/status-transitions'
import type { StatusTarefa } from '@/types/firestore'

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

const STATUS_LABELS: Record<StatusTarefa, string> = {
  pendente:     'Pendente',
  em_andamento: 'Em andamento',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
}

type TarefaFormData = z.input<typeof tarefaSchema>
type TarefaPayload = Omit<TarefaFormData, 'dataPrazo'> & {
  dataPrazo?: Timestamp | null
  clienteNome?: string | null
  responsavelNome?: string | null
  dataConclusao?: Timestamp | null
}

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
  const { usuario } = useAuth()

  const [clientes, setClientes] = useState<ClienteItem[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])
  const [loading, setLoading]   = useState(true)

  // Status de origem para a matriz de transição (@/lib/status-transitions):
  // numa tarefa nova não há "de-status" real, tratamos como se partisse de
  // 'pendente'. isResponsavelAtual libera reabrir/ressuscitar a própria
  // tarefa mesmo sem ser admin (ver decisão sinalizada no relatório de entrega).
  const statusOrigem: StatusTarefa = (isEditing ? initialData?.status : undefined) ?? 'pendente'
  const isResponsavelAtual = isEditing && !!usuario?.uid && initialData?.responsavelId === usuario.uid

  // initialData vem do doc cru do Firestore: dataPrazo pode ser um Timestamp,
  // mas o input é type="date" e o schema espera string 'YYYY-MM-DD'.
  const normalizedInitialData = initialData
    ? { ...initialData, dataPrazo: toDateInputValue(initialData.dataPrazo) }
    : undefined

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TarefaFormData>({
    resolver: zodResolver(tarefaSchema),
    defaultValues: { prioridade: 'normal', status: 'pendente', ...normalizedInitialData },
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
    // Guarda de defesa em profundidade: a UI já restringe as opções do Select
    // (ver render abaixo), mas revalida aqui contra a mesma matriz de
    // transição para cobrir qualquer mudança de estado entre o carregamento
    // do formulário e o submit.
    const statusDestino: StatusTarefa = data.status ?? 'pendente'
    if (statusDestino !== statusOrigem
      && !tarefaPodeTransicionar(statusOrigem, statusDestino, { perfil: usuario?.perfil, isResponsavel: isResponsavelAtual })
    ) {
      toast.error('Você não tem permissão para essa mudança de status.')
      return
    }

    const payload = buildPayload(data, clientes, usuarios, initialData?.status)

    try {
      if (isEditing) {
        await updateDocument('tarefas', initialData!.id!, payload)
        toast.success('Tarefa atualizada!')
        if (onSuccess) onSuccess(initialData!.id!)
        else { router.push('/tarefas'); router.refresh() }
      } else {
        const id = await createDocument('tarefas', payload)
        toast.success('Tarefa criada!')
        if (onSuccess) onSuccess(id)
        else { router.push('/tarefas'); router.refresh() }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar a tarefa. Verifique título, status e permissões.'))
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
                render={({ field }) => {
                  // Matriz de transição (@/lib/status-transitions): reabrir uma
                  // tarefa concluída ou ressuscitar uma cancelada exige ser
                  // admin ou o responsável atual pela tarefa.
                  const opcoes = opcoesStatusTarefa(statusOrigem, { perfil: usuario?.perfil, isResponsavel: isResponsavelAtual })
                  const estadoTravado = isEditing && opcoes.length === 1 && opcoes[0] === statusOrigem
                    && (statusOrigem === 'concluida' || statusOrigem === 'cancelada')

                  return (
                    <>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {opcoes.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {estadoTravado && (
                        <p className="text-xs text-muted-foreground">
                          {statusOrigem === 'concluida'
                            ? 'Apenas o responsável ou um administrador pode reabrir esta tarefa.'
                            : 'Apenas o responsável ou um administrador pode ressuscitar esta tarefa.'}
                        </p>
                      )}
                    </>
                  )
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? SELECT_NONE_VALUE} onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? null : v)} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione o cliente'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>Nenhum</SelectItem>
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
                <Select value={field.value ?? SELECT_NONE_VALUE} onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? null : v)} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione o responsável'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>Nenhum</SelectItem>
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

function buildPayload(
  data: TarefaFormData,
  clientes: ClienteItem[],
  usuarios: UsuarioItem[],
  statusAnterior?: TarefaFormData['status']
): TarefaPayload {
  const cliente = data.clienteId ? clientes.find((c) => c.id === data.clienteId) : null
  const responsavel = data.responsavelId ? usuarios.find((u) => u.id === data.responsavelId) : null
  const dataPrazo = data.dataPrazo
    ? Timestamp.fromDate(new Date(`${data.dataPrazo}T12:00:00`))
    : null

  // Carimba a conclusão só na transição para "concluida"; ao sair dela, limpa.
  // Se já estava concluida, não mexe (evita sobrescrever o carimbo original).
  const jaEstavaConcluida = statusAnterior === 'concluida'
  const dataConclusao = data.status === 'concluida'
    ? (jaEstavaConcluida ? undefined : Timestamp.now())
    : (jaEstavaConcluida ? null : undefined)

  return {
    ...data,
    clienteId: data.clienteId || null,
    clienteNome: cliente?.razaoSocial ?? null,
    responsavelId: data.responsavelId || null,
    responsavelNome: responsavel?.nome ?? null,
    dataPrazo,
    dataConclusao,
  }
}
