'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FirebaseError } from 'firebase/app'
import { Timestamp, where } from 'firebase/firestore'
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
import { formatServiceLabel, looksLikeOpaqueId } from '@/lib/service-label'
import { Loader2 } from 'lucide-react'
import {
  getClientes,
  getUsuarios,
  getClienteServicos,
  getServicos,
  listDocuments,
  setDocument,
  updateDocument,
} from '@/lib/firestore-client'
import { SELECT_NONE_VALUE } from '@/lib/select-values'
import { useAuth } from '@/contexts/auth-context'
import { competenciaPodeTransicionar, opcoesStatusCompetencia } from '@/lib/status-transitions'
import type { StatusCompetencia } from '@/types/firestore'

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

const STATUS_LABELS: Record<StatusCompetencia, string> = {
  aberta:       'Aberta',
  em_andamento: 'Em andamento',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
}

interface ClienteItem { id: string; razaoSocial: string }
interface ServicoItem { id: string; servicoId?: string; servicoNome: string; servicoCodigo?: string | null }
interface UsuarioItem { id: string; nome: string }

interface CompetenciaFormProps {
  initialData?: Partial<CompetenciaFormData> & { id?: string }
  onSuccess?: (id: string) => void
  onClose?: () => void
}

export function CompetenciaForm({ initialData, onSuccess, onClose }: CompetenciaFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id
  const { usuario } = useAuth()

  const [clientes, setClientes]             = useState<ClienteItem[]>([])
  const [servicosState, setServicosState]   = useState<{ clienteId: string; items: ServicoItem[] }>({
    clienteId: '',
    items: [],
  })
  const [usuarios, setUsuarios]             = useState<UsuarioItem[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  // Contagem de tarefas ainda abertas (pendente/em_andamento) vinculadas a esta
  // competência — usada para bloquear a conclusão manual enquanto houver
  // pendência (ver matriz de transição em '@/lib/status-transitions').
  const [tarefasAbertas, setTarefasAbertas] = useState(0)

  const hoje = new Date()
  // Status de origem para fins de matriz de transição: numa competência nova
  // não há "de-status" real, tratamos como se partisse de 'aberta'.
  const statusOrigem: StatusCompetencia = (isEditing ? initialData?.status : undefined) ?? 'aberta'

  const {
    register,
    handleSubmit,
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

  const clienteId = useWatch({ control, name: 'clienteId' })
  const servicos = clienteId && servicosState.clienteId === clienteId ? servicosState.items : []
  const loadingServicos = Boolean(clienteId) && servicosState.clienteId !== clienteId

  // Na edição, o clienteId inicial já vem preenchido e o efeito abaixo roda no
  // mount só para carregar a lista de serviços — não pode apagar o serviço salvo.
  const skipInitialServicoResetRef = useRef(isEditing)

  useEffect(() => {
    Promise.allSettled([
      getClientes(),
      getUsuarios(),
    ]).then(([rc, ru]) => {
      if (rc.status === 'fulfilled') setClientes(rc.value as unknown as ClienteItem[])
      if (ru.status === 'fulfilled') setUsuarios(ru.value as unknown as UsuarioItem[])
      setLoadingClientes(false)
    })
  }, [])

  // Pré-condição para concluir: não deixa concluir a competência enquanto
  // houver tarefa vinculada ainda pendente/em_andamento (ver auditoria —
  // hoje era possível concluir com tarefas abertas). Checagem best-effort no
  // client; a garantia forte fica registrada como pendência para o dono do
  // produto (ver relatório de entrega).
  useEffect(() => {
    if (!isEditing || !initialData?.id) return
    let mounted = true
    listDocuments<{ status?: string }>('tarefas', [where('competenciaId', '==', initialData.id)])
      .then((tarefas) => {
        if (!mounted) return
        const abertas = tarefas.filter((t) => t.status !== 'concluida' && t.status !== 'cancelada').length
        setTarefasAbertas(abertas)
      })
      .catch(() => {
        if (mounted) setTarefasAbertas(0)
      })
    return () => {
      mounted = false
    }
  }, [isEditing, initialData?.id])

  useEffect(() => {
    if (!clienteId) {
      return
    }

    let mounted = true
    Promise.allSettled([
      getClienteServicos(clienteId),
      getServicos(),
    ]).then(([rcs, rs]) => {
      if (!mounted) return

      if (rcs.status === 'fulfilled' && rs.status === 'fulfilled') {
        const allServicos = rs.value as Array<{ id: string; nome?: string; codigo?: string | null }>
        const joined: ServicoItem[] = (rcs.value as Array<Record<string, unknown>>)
          .filter((cs) => (cs.status as string | undefined) !== 'inativo')
          .map((cs) => {
            const catalog = allServicos.find((s) => s.id === (cs.servicoId as string))
            const savedName = cs.servicoNome as string | undefined
            const servicoNome = savedName && !looksLikeOpaqueId(savedName) && savedName !== cs.servicoId
              ? savedName
              : catalog?.nome
            return {
              id: cs.id as string,
              servicoId: cs.servicoId as string | undefined,
              servicoNome: formatServiceLabel({
                id: catalog?.id,
                servicoId: cs.servicoId as string | undefined,
                nome: servicoNome,
                codigo: (cs.servicoCodigo as string | undefined) ?? catalog?.codigo,
              }),
              servicoCodigo: (cs.servicoCodigo as string | undefined) ?? catalog?.codigo ?? null,
            }
          })
        setServicosState({ clienteId, items: joined })
      }

      if (skipInitialServicoResetRef.current) {
        // Primeiro run na edição: só carrega a lista, preserva o serviço salvo.
        skipInitialServicoResetRef.current = false
      } else {
        setValue('clienteServicoId', '')
      }
    })

    return () => {
      mounted = false
    }
  }, [clienteId, setValue])

  async function onSubmit(data: CompetenciaFormData) {
    // Guarda de defesa em profundidade: a UI já restringe as opções do Select
    // (ver render abaixo), mas revalida aqui contra a mesma matriz de
    // transição para cobrir qualquer mudança de estado entre o carregamento
    // do formulário e o submit.
    const statusDestino: StatusCompetencia = data.status ?? 'aberta'
    if (statusDestino !== statusOrigem) {
      if (!competenciaPodeTransicionar(statusOrigem, statusDestino, usuario?.perfil)) {
        toast.error('Você não tem permissão para essa mudança de status.')
        return
      }
      if (statusDestino === 'concluida' && tarefasAbertas > 0) {
        toast.error(
          `Não é possível concluir: ${tarefasAbertas} tarefa(s) aberta(s) vinculada(s) a esta competência.`
        )
        return
      }
    }

    const cliente = clientes.find((c) => c.id === data.clienteId)
    const servico = servicos.find((s) => s.id === data.clienteServicoId)
    const responsavel = data.responsavelId ? usuarios.find((u) => u.id === data.responsavelId) : null

    // Carimba a conclusão só na transição para "concluida" (mesmo campo do
    // CompetenciaDoc: dataConclusao); ao sair dela, limpa. Se já estava
    // concluida, não mexe (evita sobrescrever o carimbo original).
    const jaEstavaConcluida = initialData?.status === 'concluida'
    const dataConclusao = data.status === 'concluida'
      ? (jaEstavaConcluida ? undefined : Timestamp.now())
      : (jaEstavaConcluida ? null : undefined)

    const payload = {
      ...data,
      clienteNome: cliente?.razaoSocial ?? null,
      servicoNome: servico?.servicoNome ?? null,
      responsavelId: data.responsavelId || null,
      responsavelNome: responsavel?.nome ?? null,
      dataConclusao,
    }

    try {
      if (isEditing) {
        await updateDocument('competencias', initialData!.id!, payload)
        toast.success('Competência atualizada!')
        if (onSuccess) onSuccess(initialData!.id!)
        else router.push(`/competencias/${initialData!.id}`)
      } else {
        const docId = `${data.clienteId}_${data.clienteServicoId}_${data.ano}_${String(data.mes).padStart(2, '0')}`
        const id = await setDocument('competencias', docId, payload)
        toast.success('Competência criada!')
        if (onSuccess) onSuccess(id)
        else router.push(`/competencias/${id}`)
      }
    } catch (err) {
      const message = err instanceof FirebaseError && err.code === 'permission-denied'
        ? 'Sem permissão para salvar competência.'
        : err instanceof Error && err.message.includes('Documento já existe')
          ? 'Competência já existe para este cliente, serviço e mês.'
          : 'Erro ao salvar competência. Verifique cliente, serviço e tente novamente.'
      toast.error(message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados da Competência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              Para trocar cliente/serviço/competência, crie uma nova.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={isEditing || loadingClientes}>
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
              render={({ field }) => {
                const selected = servicos.find((s) => s.id === field.value)
                const placeholder = !clienteId ? 'Selecione um cliente primeiro'
                  : loadingServicos ? 'Carregando...'
                  : servicos.length === 0 ? 'Nenhum serviço vinculado'
                  : 'Selecione o serviço'
                return (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    disabled={isEditing || !clienteId || loadingServicos}
                  >
                    <SelectTrigger className="w-full">
                      <span className={selected ? 'truncate text-left' : 'truncate text-left text-muted-foreground'}>
                        {selected ? formatServiceLabel(selected) : placeholder}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {servicos.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{formatServiceLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }}
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
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v ?? '0'))} disabled={isEditing}>
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
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v ?? '0'))} disabled={isEditing}>
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
              render={({ field }) => {
                // Matriz de transição (@/lib/status-transitions): filtra as opções
                // de destino conforme o status atual e o perfil do usuário —
                // reabrir uma competência concluída ou ressuscitar uma cancelada
                // exige admin; concluir exige não haver tarefa vinculada aberta.
                const opcoesPermitidas = opcoesStatusCompetencia(statusOrigem, usuario?.perfil)
                const bloqueiaConclusao = opcoesPermitidas.includes('concluida')
                  && tarefasAbertas > 0 && statusOrigem !== 'concluida'
                const opcoes = bloqueiaConclusao
                  ? opcoesPermitidas.filter((s) => s !== 'concluida')
                  : opcoesPermitidas
                const estadoTravado = isEditing && opcoesPermitidas.length === 1 && opcoesPermitidas[0] === statusOrigem
                  && (statusOrigem === 'concluida' || statusOrigem === 'cancelada')

                return (
                  <>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {opcoes.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {bloqueiaConclusao && (
                      <p className="text-xs text-warning">
                        Não é possível concluir: {tarefasAbertas} tarefa(s) aberta(s) vinculada(s) a esta competência.
                      </p>
                    )}
                    {estadoTravado && (
                      <p className="text-xs text-muted-foreground">
                        {statusOrigem === 'concluida'
                          ? 'Apenas administradores podem reabrir uma competência concluída.'
                          : 'Apenas administradores podem ressuscitar uma competência cancelada.'}
                      </p>
                    )}
                  </>
                )
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Controller
              name="responsavelId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? SELECT_NONE_VALUE} onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? undefined : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
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
