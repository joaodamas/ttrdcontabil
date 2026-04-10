'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { MESES } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import {
  getClientes,
  getUsuarios,
  getClienteServicos,
  getServicos,
  createDocument,
  updateDocument,
} from '@/lib/firestore-client'

const competenciaSchema = z.object({
  clienteId:        z.string().min(1, 'Selecione o cliente'),
  clienteServicoId: z.string().min(1, 'Selecione o serviço'),
  mes:              z.number().min(1).max(12),
  ano:              z.number().min(2000).max(2099),
  status:           z.enum(['aberta', 'em_andamento', 'concluida', 'cancelada']).default('aberta'),
  responsavelId:    z.string().optional(),
  observacoes:      z.string().optional(),
})

type CompetenciaFormData = z.input<typeof competenciaSchema>

interface ClienteItem { id: string; razaoSocial: string }
interface ServicoItem { id: string; servico: { nome: string } }
interface UsuarioItem { id: string; nome: string }

interface CompetenciaFormProps {
  initialData?: Partial<CompetenciaFormData> & { id?: string }
  onSuccess?: (id: string) => void
  onClose?: () => void
}

export function CompetenciaForm({ initialData, onSuccess, onClose }: CompetenciaFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id

  const [clientes, setClientes]             = useState<ClienteItem[]>([])
  const [servicos, setServicos]             = useState<ServicoItem[]>([])
  const [usuarios, setUsuarios]             = useState<UsuarioItem[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [loadingServicos, setLoadingServicos] = useState(false)

  const hoje = new Date()

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CompetenciaFormData>({
    resolver: zodResolver(competenciaSchema),
    defaultValues: {
      mes:    initialData?.mes    ?? hoje.getMonth() + 1,
      ano:    initialData?.ano    ?? hoje.getFullYear(),
      status: initialData?.status ?? 'aberta',
      ...initialData,
    },
  })

  const clienteId = watch('clienteId')

  useEffect(() => {
    Promise.allSettled([
      getClientes({ status: 'ativo' }),
      getUsuarios(),
    ]).then(([rc, ru]) => {
      if (rc.status === 'fulfilled') setClientes(rc.value as unknown as ClienteItem[])
      if (ru.status === 'fulfilled') setUsuarios(ru.value as unknown as UsuarioItem[])
      setLoadingClientes(false)
    })
  }, [])

  useEffect(() => {
    if (!clienteId) {
      setServicos([])
      setValue('clienteServicoId', '')
      return
    }
    setLoadingServicos(true)
    Promise.allSettled([
      getClienteServicos(clienteId),
      getServicos(),
    ]).then(([rcs, rs]) => {
      if (rcs.status === 'fulfilled' && rs.status === 'fulfilled') {
        const allServicos = rs.value as Array<{ id: string; nome: string }>
        const joined: ServicoItem[] = (rcs.value as Array<Record<string, unknown>>).map((cs) => ({
          id: cs.id as string,
          servico: {
            nome: allServicos.find((s) => s.id === (cs.servicoId as string))?.nome ?? 'Serviço',
          },
        }))
        setServicos(joined)
      }
      setValue('clienteServicoId', '')
      setLoadingServicos(false)
    })
  }, [clienteId, setValue])

  async function onSubmit(data: CompetenciaFormData) {
    try {
      if (isEditing) {
        await updateDocument('competencias', initialData!.id!, data)
        toast.success('Competência atualizada!')
        if (onSuccess) onSuccess(initialData!.id!)
        else router.push(`/competencias/${initialData!.id}`)
      } else {
        const id = await createDocument('competencias', data)
        toast.success('Competência criada!')
        if (onSuccess) onSuccess(id)
        else router.push(`/competencias/${id}`)
      }
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados da Competência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={loadingClientes}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingClientes ? 'Carregando...' : 'Selecione o cliente'} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clienteId && <p className="text-xs text-destructive">{errors.clienteId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Serviço <span className="text-destructive">*</span></Label>
            <Controller
              name="clienteServicoId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  disabled={!clienteId || loadingServicos}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        !clienteId ? 'Selecione um cliente primeiro'
                        : loadingServicos ? 'Carregando...'
                        : servicos.length === 0 ? 'Nenhum serviço vinculado'
                        : 'Selecione o serviço'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.servico.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clienteServicoId && <p className="text-xs text-destructive">{errors.clienteServicoId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Mês <span className="text-destructive">*</span></Label>
              <Controller
                name="mes"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v ?? '0'))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Mês" /></SelectTrigger>
                    <SelectContent>
                      {MESES.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Ano <span className="text-destructive">*</span></Label>
              <Controller
                name="ano"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v ?? '0'))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Ano" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i).map((a) => (
                        <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
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
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
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
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={3} placeholder="Observações opcionais..." {...register('observacoes')} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => onClose ? onClose() : router.back()} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? 'Salvar alterações' : 'Criar competência'}
        </Button>
      </div>
    </form>
  )
}
