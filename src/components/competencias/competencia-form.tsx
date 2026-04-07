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

interface Cliente {
  id: string
  razaoSocial: string
}

interface ClienteServico {
  id: string
  servico: { nome: string }
}

interface Usuario {
  id: string
  nome: string
}

interface CompetenciaFormProps {
  initialData?: Partial<CompetenciaFormData> & { id?: string }
}

export function CompetenciaForm({ initialData }: CompetenciaFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id

  const [clientes, setClientes]       = useState<Cliente[]>([])
  const [servicos, setServicos]       = useState<ClienteServico[]>([])
  const [usuarios, setUsuarios]       = useState<Usuario[]>([])
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

  // Carregar clientes e usuários na montagem
  useEffect(() => {
    async function load() {
      try {
        const [resClientes, resUsuarios] = await Promise.all([
          fetch('/api/clientes?limit=500&status=ativo'),
          fetch('/api/usuarios?ativo=true'),
        ])
        const { clientes: c }  = await resClientes.json()
        const { usuarios: u }  = await resUsuarios.json()
        setClientes(c ?? [])
        setUsuarios(u ?? [])
      } catch {
        toast.error('Erro ao carregar dados')
      } finally {
        setLoadingClientes(false)
      }
    }
    load()
  }, [])

  // Carregar serviços do cliente ao selecionar cliente
  useEffect(() => {
    if (!clienteId) {
      setServicos([])
      setValue('clienteServicoId', '')
      return
    }
    setLoadingServicos(true)
    fetch(`/api/clientes/${clienteId}/servicos`)
      .then((r) => r.json())
      .then((data) => {
        setServicos(data.servicos ?? [])
        setValue('clienteServicoId', '')
      })
      .catch(() => toast.error('Erro ao carregar serviços'))
      .finally(() => setLoadingServicos(false))
  }, [clienteId, setValue])

  async function onSubmit(data: CompetenciaFormData) {
    try {
      const url    = isEditing ? `/api/competencias/${initialData?.id}` : '/api/competencias'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao salvar competência')
        return
      }

      const json = await res.json()
      toast.success(isEditing ? 'Competência atualizada!' : 'Competência criada!')
      router.push(`/competencias/${json.id ?? initialData?.id}`)
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados da Competência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label htmlFor="clienteId">
              Cliente <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  disabled={loadingClientes}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingClientes ? 'Carregando...' : 'Selecione o cliente'} />
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
          </div>

          {/* Serviço */}
          <div className="space-y-1.5">
            <Label htmlFor="clienteServicoId">
              Serviço <span className="text-destructive">*</span>
            </Label>
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
                        !clienteId
                          ? 'Selecione um cliente primeiro'
                          : loadingServicos
                          ? 'Carregando...'
                          : 'Selecione o serviço'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.servico.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clienteServicoId && (
              <p className="text-xs text-destructive">{errors.clienteServicoId.message}</p>
            )}
          </div>

          {/* Mês e Ano */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Mês <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="mes"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(parseInt(v ?? '0'))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.mes && (
                <p className="text-xs text-destructive">{errors.mes.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ano">
                Ano <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="ano"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(parseInt(v ?? '0'))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i).map((a) => (
                        <SelectItem key={a} value={String(a)}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.ano && (
                <p className="text-xs text-destructive">{errors.ano.message}</p>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
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

          {/* Responsável */}
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Controller
              name="responsavelId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v || undefined)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
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

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              rows={3}
              placeholder="Observações opcionais..."
              {...register('observacoes')}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
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
