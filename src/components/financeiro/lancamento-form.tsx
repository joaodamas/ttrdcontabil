'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
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
import { getClientes, getCompetencias, createDocument, updateDocument } from '@/lib/firestore-client'
import { SELECT_NONE_VALUE } from '@/lib/select-values'
import { formatWhatsApp, normalizeWhatsApp } from '@/lib/utils'

const lancamentoSchema = z.object({
  clienteId:        z.string().optional().nullable(),
  competenciaId:    z.string().optional().nullable(),
  clienteServicoId: z.string().optional().nullable(),
  servicoId:        z.string().optional().nullable(),
  tipo:             z.enum(['receita', 'despesa']),
  descricao:        z.string().min(1, 'Descrição é obrigatória').max(200),
  valor:            z.number().positive('Valor deve ser positivo'),
  dataVencimento:   z.string().min(1, 'Data de vencimento é obrigatória'),
  dataPagamento:    z.string().optional().nullable(),
  // 'atrasado' e 'estornado' NÃO são graváveis: 'atrasado' é sempre derivado
  // (pendente + vencimento < hoje) e 'estornado' foi descontinuado. Registros
  // legados com esses valores são normalizados ao carregar o form — ver
  // normalizeStatusLegado() abaixo.
  status:           z.enum(['pendente', 'pago', 'cancelado']).default('pendente'),
  formaPagamento:   z.string().max(50).optional().nullable(),
  pagadorNome:      z.string().optional().nullable(),
  pagadorWhatsapp:  z.string().optional().nullable(),
  cobrancaWhatsappEnabled: z.boolean().default(true),
  statusWhatsappCobranca: z.enum(['nao_agendado', 'agendado', 'enviado', 'entregue', 'lido', 'respondido', 'falhou', 'pausado']).default('nao_agendado'),
  whatsappCobrancaPausada: z.boolean().default(false),
  whatsappCobrancaPausadaMotivo: z.string().optional().nullable(),
  whatsappCobrancaIgnorada: z.boolean().default(false),
  whatsappCobrancaExigeAprovacao: z.boolean().default(false),
  observacoes:      z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.tipo === 'receita' && !data.clienteId) {
    ctx.addIssue({
      code: 'custom',
      path: ['clienteId'],
      message: 'Receitas devem estar vinculadas a um cliente',
    })
  }
  if (data.status === 'pago' && !data.dataPagamento) {
    ctx.addIssue({
      code: 'custom',
      path: ['dataPagamento'],
      message: 'Informe a data de pagamento para marcar como pago.',
    })
  }
})

type LancamentoFormData = z.input<typeof lancamentoSchema>
type LancamentoPayload = Omit<LancamentoFormData, 'dataVencimento' | 'dataPagamento'> & {
  clienteNome?: string | null
  dataVencimento: Timestamp
  dataPagamento?: Timestamp | null
}

interface ClienteItem { id: string; razaoSocial: string }
interface CompetenciaItem { id: string; mes: number; ano: number; servicoNome?: string }

// Status legado que pode vir gravado em documentos antigos (Firestore não
// valida o enum). O form nunca oferece esses valores, mas precisa aceitá-los
// como entrada ao editar um lançamento existente.
type StatusLegado = LancamentoFormData['status'] | 'atrasado' | 'estornado'

// Cura o status legado para o modelo atual: 'atrasado' volta a ser derivado
// (pendente + vencimento < hoje), 'estornado' vira 'cancelado'.
function normalizeStatusLegado(status?: StatusLegado): LancamentoFormData['status'] {
  if (status === 'atrasado') return 'pendente'
  if (status === 'estornado') return 'cancelado'
  return status
}

interface LancamentoFormProps {
  initialData?: Partial<Omit<LancamentoFormData, 'status'>> & { status?: StatusLegado; id?: string }
  onSuccess?: (id: string) => void
  onClose?: () => void
}

export function LancamentoForm({ initialData, onSuccess, onClose }: LancamentoFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id

  const [clientes, setClientes]         = useState<ClienteItem[]>([])
  const [loadingClientes, setLoading]   = useState(true)
  const [competencias, setCompetencias]             = useState<CompetenciaItem[]>([])
  const [loadingCompetencias, setLoadingCompetencias] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LancamentoFormData>({
    resolver: zodResolver(lancamentoSchema),
    defaultValues: {
      tipo: 'receita',
      cobrancaWhatsappEnabled: true,
      statusWhatsappCobranca: 'nao_agendado',
      whatsappCobrancaPausada: false,
      whatsappCobrancaIgnorada: false,
      whatsappCobrancaExigeAprovacao: false,
      ...initialData,
      status: normalizeStatusLegado(initialData?.status) ?? 'pendente',
    },
  })
  const tipo = useWatch({ control, name: 'tipo' })
  const status = useWatch({ control, name: 'status' })
  const clienteId = useWatch({ control, name: 'clienteId' })

  // Na edição, o clienteId inicial já vem preenchido e o efeito abaixo roda no
  // mount só para carregar a lista de competências — não pode apagar a
  // competência salva. Só a partir da 2ª execução (troca manual de cliente)
  // é que o competenciaId deve ser limpo.
  const skipInitialCompetenciaResetRef = useRef(isEditing)

  useEffect(() => {
    getClientes({ status: 'ativo' })
      .then((data) => setClientes(data as unknown as ClienteItem[]))
      .catch(() => toast.error('Erro ao carregar clientes'))
      .finally(() => setLoading(false))
  }, [])

  // Carrega as competências do cliente selecionado para permitir vincular o
  // lançamento (ex: honorário automático) à competência correspondente.
  useEffect(() => {
    const skipReset = skipInitialCompetenciaResetRef.current
    skipInitialCompetenciaResetRef.current = false

    if (!clienteId) {
      setCompetencias([])  // eslint-disable-line react-hooks/set-state-in-effect
      if (!skipReset) setValue('competenciaId', null)
      return
    }

    // Cliente trocado (não é o carregamento inicial de uma edição): a
    // competência selecionada pertence ao cliente anterior, então precisa
    // ser limpa para evitar gravar competenciaId de outro cliente.
    if (!skipReset) setValue('competenciaId', null)

    setLoadingCompetencias(true)
    getCompetencias({ clienteId })
      .then((data) => setCompetencias(data as unknown as CompetenciaItem[]))
      .catch(() => toast.error('Erro ao carregar competências do cliente'))
      .finally(() => setLoadingCompetencias(false))
  }, [clienteId, setValue])

  async function onSubmit(data: LancamentoFormData) {
    const cliente = data.clienteId ? clientes.find((c) => c.id === data.clienteId) : null
    const payload: LancamentoPayload = {
      ...data,
      clienteId: data.clienteId || null,
      competenciaId: data.competenciaId || null,
      clienteNome: cliente?.razaoSocial ?? null,
      pagadorNome: data.pagadorNome || cliente?.razaoSocial || null,
      pagadorWhatsapp: normalizeWhatsApp(data.pagadorWhatsapp),
      dataVencimento: Timestamp.fromDate(new Date(`${data.dataVencimento}T12:00:00`)),
      dataPagamento: data.dataPagamento ? Timestamp.fromDate(new Date(`${data.dataPagamento}T12:00:00`)) : null,
    }

    try {
      if (isEditing) {
        await updateDocument('lancamentos', initialData!.id!, payload)
        toast.success('Lançamento atualizado!')
        if (onSuccess) onSuccess(initialData!.id!)
        else { router.push('/financeiro'); router.refresh() }
      } else {
        const id = await createDocument('lancamentos', payload)
        toast.success('Lançamento criado!')
        if (onSuccess) onSuccess(id)
        else { router.push('/financeiro'); router.refresh() }
      }
    } catch {
      toast.error('Erro ao salvar lançamento. Verifique cliente, valor e vencimento.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dados do Lançamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo <span className="text-destructive">*</span></Label>
            <Controller
              name="tipo"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição <span className="text-destructive">*</span></Label>
            <Input id="descricao" {...register('descricao')} placeholder="Ex: Honorários contábeis — Janeiro/2025" />
            {errors.descricao && <p className="text-xs text-destructive">{errors.descricao.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor (R$) <span className="text-destructive">*</span></Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                {...register('valor', { valueAsNumber: true })}
              />
              {errors.valor && <p className="text-xs text-destructive">{errors.valor.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataVencimento">Vencimento <span className="text-destructive">*</span></Label>
              <Input id="dataVencimento" type="date" {...register('dataVencimento')} />
              {errors.dataVencimento && <p className="text-xs text-destructive">{errors.dataVencimento.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="formaPagamento">Forma de Pagamento</Label>
              <Input id="formaPagamento" {...register('formaPagamento')} placeholder="Ex: PIX, Boleto, TED..." />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dataPagamento">
              Data de Pagamento {status === 'pago' ? <span className="text-destructive">*</span> : null}
            </Label>
            <Input id="dataPagamento" type="date" {...register('dataPagamento')} className="max-w-48" />
            {errors.dataPagamento && <p className="text-xs text-destructive">{errors.dataPagamento.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Cliente {tipo === 'receita' ? <span className="text-destructive">*</span> : null}</Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? SELECT_NONE_VALUE} onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? null : v)} disabled={loadingClientes}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingClientes ? 'Carregando...' : 'Selecione o cliente'} />
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
            {errors.clienteId && <p className="text-xs text-destructive">{errors.clienteId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Competência (opcional)</Label>
            <Controller
              name="competenciaId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? SELECT_NONE_VALUE}
                  onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? null : v)}
                  disabled={loadingCompetencias || !clienteId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !clienteId ? 'Selecione um cliente primeiro'
                        : loadingCompetencias ? 'Carregando...'
                        : 'Selecione a competência'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>Nenhuma</SelectItem>
                    {competencias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {String(c.mes).padStart(2, '0')}/{c.ano}
                        {c.servicoNome ? ` — ${c.servicoNome}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pagadorNome">Pagador</Label>
              <Input id="pagadorNome" {...register('pagadorNome')} placeholder="Nome do pagador / responsável financeiro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagadorWhatsapp">WhatsApp do pagador</Label>
              <Input
                id="pagadorWhatsapp"
                {...register('pagadorWhatsapp')}
                placeholder="(11) 99999-9999"
                onChange={(e) => {
                  e.target.value = formatWhatsApp(e.target.value)
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Cobrança WhatsApp</Label>
              <Controller
                name="cobrancaWhatsappEnabled"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ? 'sim' : 'nao'} onValueChange={(v) => field.onChange(v === 'sim')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Ativa</SelectItem>
                      <SelectItem value="nao">Desligada</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status WhatsApp</Label>
              <Controller
                name="statusWhatsappCobranca"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_agendado">Não agendado</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="pausado">Pausado</SelectItem>
                      <SelectItem value="falhou">Falhou</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pausa manual</Label>
              <Controller
                name="whatsappCobrancaPausada"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ? 'sim' : 'nao'} onValueChange={(v) => field.onChange(v === 'sim')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Exige aprovação</Label>
              <Controller
                name="whatsappCobrancaExigeAprovacao"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ? 'sim' : 'nao'} onValueChange={(v) => field.onChange(v === 'sim')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsappCobrancaPausadaMotivo">Motivo da pausa / exceção</Label>
            <Input id="whatsappCobrancaPausadaMotivo" {...register('whatsappCobrancaPausadaMotivo')} placeholder="Negociação, exceção, cliente sem consentimento..." />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={3} placeholder="Informações adicionais..." {...register('observacoes')} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Lançamento'}
        </Button>
        <Button type="button" variant="outline" onClick={() => onClose ? onClose() : router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
