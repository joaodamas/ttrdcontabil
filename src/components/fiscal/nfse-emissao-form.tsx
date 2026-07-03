'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CpfCnpjInput } from '@/components/ui/cpf-cnpj-input'
import { Loader2, Save, Send, ArrowLeft, CheckCircle2, ChevronRight, RotateCcw } from 'lucide-react'
import { formatCurrency, formatCpfCnpj, validateCpf, validateCnpj } from '@/lib/utils'
import { getClientes, getCompetencias, createDocument, getDocument, updateDocument, listDocuments } from '@/lib/firestore-client'
import { where, orderBy, limit } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { SELECT_NONE_VALUE } from '@/lib/select-values'

function isValidCpfCnpj(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return validateCpf(digits)
  if (digits.length === 14) return validateCnpj(digits)
  return false
}

function isValidCodigoServico(code: string): boolean {
  return /^\d{1,4}(\.\d{1,4})?$/.test(code.trim())
}

const nfseSchema = z.object({
  clienteId:        z.string().min(1, 'Cliente é obrigatório'),
  competenciaId:    z.string().optional().nullable(),
  tomadorNome:      z.string().min(1, 'Nome do tomador é obrigatório').max(150),
  tomadorCpfCnpj:   z.string().min(11, 'CPF/CNPJ inválido').max(18).refine(
    v => isValidCpfCnpj(v),
    { message: 'CPF/CNPJ inválido — verifique os dígitos' }
  ),
  tomadorEmail:     z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  descricaoServico: z.string().min(10, 'Descrição muito curta (mín. 10 caracteres)').max(500),
  codigoServico:    z.string().min(1, 'Código do serviço é obrigatório').max(20).refine(
    v => isValidCodigoServico(v),
    { message: 'Formato inválido. Use ex: 17.19 ou 6014' }
  ),
  valorServico:     z.number().min(0.01, 'Valor deve ser maior que zero'),
  aliquota:         z.number().min(0).max(100).optional().nullable(),
  issRetido:        z.boolean().default(false),
})

type NfseFormData = z.input<typeof nfseSchema>

interface Cliente { id: string; razaoSocial: string; cpfCnpj?: string; email?: string }
interface Competencia { id: string; mes: number; ano: number; servicoNome?: string }
type RascunhoNfse = {
  id: string
  clienteId?: string
  clienteNome?: string
  competenciaId?: string | null
  status?: string
  dados?: Record<string, unknown>
}

interface NfseEmissaoFormProps {
  initialClienteId?: string
  initialRascunhoId?: string
  layout?: 'page' | 'modal'
  onCancel?: () => void
  onFinished?: () => void | Promise<void>
  onStepChange?: (step: number) => void
}

const cardClassByLayout: Record<'page' | 'modal', string> = {
  page: '',
  modal: 'border-border/70 bg-card/95 shadow-none',
}

export function NfseEmissaoForm({
  initialClienteId,
  initialRascunhoId,
  layout = 'page',
  onCancel,
  onFinished,
  onStepChange,
}: NfseEmissaoFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clienteIdParam = initialClienteId ?? searchParams.get('clienteId') ?? ''
  const rascunhoIdParam = initialRascunhoId ?? searchParams.get('rascunhoId') ?? ''

  const [clientes,           setClientes]           = useState<Cliente[]>([])
  const [competencias,       setCompetencias]       = useState<Competencia[]>([])
  const [loadingClientes,    setLoadingClientes]    = useState(true)
  const [loadingCompetencias,setLoadingCompetencias]= useState(false)
  const [loadingRascunho, setLoadingRascunho] = useState(Boolean(rascunhoIdParam))
  const [rascunhoAtual, setRascunhoAtual] = useState<RascunhoNfse | null>(null)
  const [saving,             setSaving]             = useState(false)
  const [emitting,           setEmitting]           = useState(false)
  const [emissaoPendente,    setEmissaoPendente]    = useState<NfseFormData | null>(null)
  const [showResume,         setShowResume]         = useState(false)
  const [ultimoRascunho,     setUltimoRascunho]     = useState<RascunhoNfse | null>(null)
  const [loadingUltimoRasc,  setLoadingUltimoRasc]  = useState(false)
  const [templates,          setTemplates]          = useState<RascunhoNfse[]>([])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<NfseFormData>({
    resolver: zodResolver(nfseSchema),
    defaultValues: { issRetido: false, clienteId: clienteIdParam || undefined },
  })

  const selectedClienteId = watch('clienteId')
  const watchedValues = watch()

  // Compute active wizard step based on filled fields
  useEffect(() => {
    if (!onStepChange) return
    if (showResume) { onStepChange(4); return }
    const { clienteId, tomadorNome, tomadorCpfCnpj, descricaoServico, codigoServico, valorServico } = watchedValues
    if (!clienteId) { onStepChange(0); return }
    if (!tomadorNome || !tomadorCpfCnpj) { onStepChange(1); return }
    if (!descricaoServico || !codigoServico || !valorServico) { onStepChange(2); return }
    onStepChange(3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.clienteId, watchedValues.tomadorNome, watchedValues.tomadorCpfCnpj, watchedValues.descricaoServico, watchedValues.codigoServico, watchedValues.valorServico, onStepChange, showResume])

  // Load clients on mount
  useEffect(() => {
    getClientes({ status: 'ativo' })
      .then((data) => setClientes(data as unknown as Cliente[]))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar clientes ativos. Verifique sua permissão de acesso.')))
      .finally(() => setLoadingClientes(false))
  }, [])

  useEffect(() => {
    if (!rascunhoIdParam) return
    setLoadingRascunho(true)
    getDocument<RascunhoNfse>('nfse_rascunhos', rascunhoIdParam)
      .then((rascunho) => {
        if (!rascunho) {
          toast.error('Rascunho NFS-e não encontrado.')
          router.push('/fiscal')
          return
        }
        const dados = rascunho.dados ?? {}
        setRascunhoAtual(rascunho)
        reset({
          clienteId: rascunho.clienteId ?? '',
          competenciaId: (rascunho.competenciaId as string | null | undefined) ?? (dados.competenciaId as string | null | undefined) ?? null,
          tomadorNome: (dados.tomadorNome as string | undefined) ?? (dados.tomador as Record<string, unknown> | undefined)?.razaoSocial as string | undefined ?? rascunho.clienteNome ?? '',
          tomadorCpfCnpj: (dados.tomadorCpfCnpj as string | undefined) ?? (dados.tomador as Record<string, unknown> | undefined)?.cpfCnpj as string | undefined ?? '',
          tomadorEmail: (dados.tomadorEmail as string | undefined) ?? (dados.tomador as Record<string, unknown> | undefined)?.email as string | undefined ?? '',
          descricaoServico: (dados.descricaoServico as string | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.discriminacao as string | undefined ?? '',
          codigoServico: (dados.codigoServico as string | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.codigoServico as string | undefined ?? '',
          valorServico: Number((dados.valorServico as number | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.valorServico ?? 0),
          aliquota: (dados.aliquota as number | null | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.aliquota as number | null | undefined ?? null,
          issRetido: Boolean((dados.issRetido as boolean | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.issRetido ?? false),
        })
      })
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar o rascunho NFS-e para revisão.')))
      .finally(() => setLoadingRascunho(false))
  }, [rascunhoIdParam, reset, router])

  // Load last rascunhos for auto-fill + templates
  useEffect(() => {
    if (!selectedClienteId || rascunhoIdParam) { setUltimoRascunho(null); setTemplates([]); return }
    setLoadingUltimoRasc(true)
    listDocuments<RascunhoNfse>('nfse_rascunhos', [
      where('clienteId', '==', selectedClienteId),
      orderBy('criadoEm', 'desc'),
      limit(5),
    ]).then(results => {
      setUltimoRascunho(results.length > 0 ? results[0] : null)
      setTemplates(results)
    })
      .catch(() => { setUltimoRascunho(null); setTemplates([]) })
      .finally(() => setLoadingUltimoRasc(false))
  }, [selectedClienteId, rascunhoIdParam])

  function applyRascunhoData(r: RascunhoNfse) {
    const dados = r.dados ?? {}
    if (dados.descricaoServico) setValue('descricaoServico', dados.descricaoServico as string)
    if (dados.codigoServico)    setValue('codigoServico',    dados.codigoServico as string)
    if (dados.valorServico)     setValue('valorServico',     Number(dados.valorServico))
    if (dados.aliquota != null) setValue('aliquota',         Number(dados.aliquota))
    if (dados.issRetido != null) setValue('issRetido',       Boolean(dados.issRetido))
  }

  function applyUltimoRascunho() {
    if (!ultimoRascunho) return
    applyRascunhoData(ultimoRascunho)
    toast.success('Dados do último rascunho aplicados.')
  }

  // When client selected: auto-fill tomador + load competencias
  useEffect(() => {
    if (!selectedClienteId) {
      setCompetencias([])
      return
    }

    const cliente = clientes.find((c) => c.id === selectedClienteId)
    if (cliente) {
      if (!rascunhoAtual) {
        setValue('tomadorNome', cliente.razaoSocial)
        if (cliente.cpfCnpj) setValue('tomadorCpfCnpj', cliente.cpfCnpj)
        if (cliente.email)   setValue('tomadorEmail', cliente.email)
      }
    }

    setLoadingCompetencias(true)
    getCompetencias({ clienteId: selectedClienteId })
      .then((data) => setCompetencias(data as unknown as Competencia[]))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar competências do cliente selecionado.')))
      .finally(() => setLoadingCompetencias(false))
  }, [selectedClienteId, clientes, setValue, rascunhoAtual])

  async function handleSaveRascunho(data: NfseFormData) {
    setSaving(true)
    try {
      const cliente = clientes.find((c) => c.id === data.clienteId)
      const payload = {
        clienteId:     data.clienteId,
        clienteNome:   cliente?.razaoSocial ?? data.tomadorNome,
        competenciaId: data.competenciaId ?? null,
        titulo:        `NFS-e — ${data.tomadorNome}`,
        status:        'aguardando_emissao',
        requerRevisao: false,
        dados: {
          tomadorNome:      data.tomadorNome,
          tomadorCpfCnpj:   data.tomadorCpfCnpj.replace(/\D/g, ''),
          tomadorEmail:     data.tomadorEmail || null,
          descricaoServico: data.descricaoServico,
          codigoServico:    data.codigoServico,
          valorServico:     data.valorServico,
          aliquota:         data.aliquota ?? null,
          issRetido:        data.issRetido,
        },
      }
      if (rascunhoAtual) {
        await updateDocument('nfse_rascunhos', rascunhoAtual.id, payload)
        toast.success('Rascunho revisado e liberado para emissão em lote.')
      } else {
        await createDocument('nfse_rascunhos', payload)
        toast.success('Rascunho salvo com sucesso!')
      }
      await finishFlow()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o rascunho. Verifique cliente, serviço e permissão fiscal.'))
    } finally {
      setSaving(false)
    }
  }

  function solicitarEmissao(data: NfseFormData) {
    setEmissaoPendente(data)
  }

  async function confirmarEmissao() {
    if (!emissaoPendente) return
    const data = emissaoPendente

    setEmitting(true)
    try {
      const functions = getFunctions(getFirebaseApp(), 'southamerica-east1')
      const emitirNfse = httpsCallable<Record<string, unknown>, { sucesso: boolean; numeroNfse?: string; codigoVerificacao?: string; erro?: string; detalhes?: string; codigoErro?: string }>(
        functions,
        'emitirNfse'
      )

      const payload = {
        clienteId:     data.clienteId,
        rascunhoId:    rascunhoAtual?.id,
        competenciaId: data.competenciaId ?? null,
        tomador: {
          razaoSocial: data.tomadorNome,
          cpfCnpj:     data.tomadorCpfCnpj.replace(/\D/g, ''),
          email:       data.tomadorEmail || undefined,
        },
        servico: {
          discriminacao:  data.descricaoServico,
          codigoServico:  data.codigoServico,
          valorServico:   data.valorServico,
          aliquota:       data.aliquota ?? undefined,
          issRetido:      data.issRetido,
        },
      }

      const result = await emitirNfse(payload)
      const res = result.data

      if (res.sucesso) {
        const msg = res.numeroNfse
          ? `NFS-e emitida com sucesso! Número: ${res.numeroNfse}`
          : 'NFS-e emitida com sucesso!'
        toast.success(msg)
        await finishFlow()
      } else {
        const mensagem = [
          res.codigoErro ? `Código: ${res.codigoErro}` : null,
          res.erro ?? 'Erro ao emitir NFS-e.',
          res.detalhes && res.detalhes !== res.erro ? `Detalhes técnicos: ${res.detalhes}` : null,
        ].filter(Boolean).join('\n')
        toast.error(mensagem.slice(0, 1500))
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível emitir a NFS-e. Verifique configuração fiscal, credencial e homologação do município.'))
    } finally {
      setEmitting(false)
      setEmissaoPendente(null)
    }
  }

  const isLoading = saving || emitting
  const isEditingRascunho = Boolean(rascunhoAtual)
  const previewCliente = clientes.find((c) => c.id === selectedClienteId)
  const previewCompetenciaId = watch('competenciaId')
  const previewCompetencia = competencias.find((c) => c.id === previewCompetenciaId)
  const previewValor = watch('valorServico')
  const previewCodigo = watch('codigoServico')
  const previewAliquota = watch('aliquota')
  const previewIssRetido = watch('issRetido')
  const previewTomadorNome = watch('tomadorNome')
  const previewTomadorCpf = watch('tomadorCpfCnpj')
  const previewTomadorEmail = watch('tomadorEmail')
  const previewDescricao = watch('descricaoServico')
  const allFieldsFilled = Boolean(selectedClienteId && previewTomadorNome && previewTomadorCpf && previewDescricao && previewCodigo && previewValor)
  const isModal = layout === 'modal'

  function handleShowResume() { setShowResume(true) }
  function handleBackFromResume() { setShowResume(false) }

  async function finishFlow() {
    if (onFinished) await onFinished()
    if (onCancel) {
      onCancel()
      return
    }
    router.push('/fiscal')
  }

  function cancelFlow() {
    if (onCancel) {
      onCancel()
      return
    }
    router.back()
  }

  return (
    <form className={isModal ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]' : 'space-y-5'}>
      <div className={isModal ? 'space-y-5' : undefined}>
      {loadingRascunho ? (
        <div className="flex items-center justify-center rounded-xl border py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {/* Resumo — step 4 */}
      {showResume && !loadingRascunho && (
        <Card className={cardClassByLayout[layout]}>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <button type="button" onClick={handleBackFromResume} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar e editar
            </button>
            <CardTitle className="text-sm flex items-center gap-2 ml-auto">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Resumo da nota
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prestador / Tomador</h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Prestador</dt><dd className="font-medium">{previewCliente?.razaoSocial ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tomador</dt><dd className="font-medium">{previewTomadorNome || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">CPF / CNPJ tomador</dt><dd className="font-mono">{previewTomadorCpf ? formatCpfCnpj(previewTomadorCpf) : '—'}</dd></div>
                {previewTomadorEmail && <div><dt className="text-xs text-muted-foreground">E-mail tomador</dt><dd>{previewTomadorEmail}</dd></div>}
                {previewCompetencia && <div><dt className="text-xs text-muted-foreground">Competência</dt><dd>{String(previewCompetencia.mes).padStart(2, '0')}/{previewCompetencia.ano}</dd></div>}
              </dl>
            </section>
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Serviço</h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descrição</dt><dd className="whitespace-pre-wrap">{previewDescricao || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Código</dt><dd className="font-mono">{previewCodigo || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className="font-semibold tabular-nums">{Number.isFinite(previewValor) ? formatCurrency(Number(previewValor)) : '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Alíquota ISS</dt><dd>{Number.isFinite(previewAliquota) ? `${Number(previewAliquota)}%` : 'Padrão configuração'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">ISS retido</dt><dd>{previewIssRetido ? 'Sim' : 'Não'}</dd></div>
              </dl>
            </section>
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning-foreground">
              Revise os dados acima. Após emitir, a nota é registrada na prefeitura e não pode ser cancelada automaticamente.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vínculo + Tomador + Serviço — hidden when resume is shown */}
      {!showResume && (<>
      <Card className={[cardClassByLayout[layout], loadingRascunho ? 'pointer-events-none opacity-60' : undefined].filter(Boolean).join(' ')}>
        <CardHeader><CardTitle className="text-sm">Vínculo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => {
                const selected = clientes.find((c) => c.id === field.value)
                return (
                <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={loadingClientes}>
                  <SelectTrigger>
                    <span className={selected ? 'truncate text-left' : 'truncate text-left text-muted-foreground'}>
                      {selected?.razaoSocial ?? (loadingClientes ? 'Carregando...' : 'Selecione o cliente')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )
              }}
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
                  disabled={loadingCompetencias || !selectedClienteId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedClienteId ? 'Selecione um cliente primeiro'
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
        </CardContent>
      </Card>

      {/* Tomador */}
      <Card className={cardClassByLayout[layout]}>
        <CardHeader><CardTitle className="text-sm">Dados do Tomador</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tomadorNome">Nome / Razão Social <span className="text-destructive">*</span></Label>
            <Input id="tomadorNome" {...register('tomadorNome')} placeholder="Nome completo ou razão social" />
            {errors.tomadorNome && <p className="text-xs text-destructive">{errors.tomadorNome.message}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tomadorCpfCnpj">CPF / CNPJ <span className="text-destructive">*</span></Label>
              <Controller
                name="tomadorCpfCnpj"
                control={control}
                render={({ field }) => (
                  <CpfCnpjInput
                    id="tomadorCpfCnpj"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChange={(masked) => field.onChange(masked)}
                    placeholder="000.000.000-00"
                  />
                )}
              />
              {errors.tomadorCpfCnpj && <p className="text-xs text-destructive">{errors.tomadorCpfCnpj.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tomadorEmail">E-mail</Label>
              <Input id="tomadorEmail" type="email" {...register('tomadorEmail')} placeholder="tomador@email.com" />
              {errors.tomadorEmail && <p className="text-xs text-destructive">{errors.tomadorEmail.message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Serviço */}
      <Card className={cardClassByLayout[layout]}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm">Serviço</CardTitle>
          <div className="flex items-center gap-1.5">
            {(ultimoRascunho || loadingUltimoRasc) && (
              <button
                type="button"
                disabled={loadingUltimoRasc}
                onClick={applyUltimoRascunho}
                className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {loadingUltimoRasc ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Último
              </button>
            )}
            {templates.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  Templates ({templates.length})
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[280px]">
                  {templates.map((t, i) => {
                    const desc = (t.dados?.descricaoServico as string | undefined) ?? `Rascunho ${i + 1}`
                    const valor = t.dados?.valorServico ? `R$ ${Number(t.dados.valorServico).toFixed(2)}` : ''
                    return (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => { applyRascunhoData(t); toast.success('Template aplicado.') }}
                        className="flex-col items-start gap-0.5"
                      >
                        <span className="line-clamp-1 text-xs font-medium">{desc.slice(0, 60)}{desc.length > 60 ? '…' : ''}</span>
                        {valor && <span className="text-[11px] text-muted-foreground">{valor}</span>}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="descricaoServico">Descrição do Serviço <span className="text-destructive">*</span></Label>
            <Textarea id="descricaoServico" rows={3} {...register('descricaoServico')} placeholder="Descreva o serviço prestado conforme contrato..." />
            {errors.descricaoServico && <p className="text-xs text-destructive">{errors.descricaoServico.message}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="codigoServico">Código do Serviço <span className="text-destructive">*</span></Label>
              <Input id="codigoServico" {...register('codigoServico')} placeholder="Ex: 17.19" />
              {errors.codigoServico && <p className="text-xs text-destructive">{errors.codigoServico.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorServico">Valor do Serviço (R$) <span className="text-destructive">*</span></Label>
              <Input id="valorServico" type="number" step="0.01" min="0.01" placeholder="0,00" {...register('valorServico', { valueAsNumber: true })} />
              {errors.valorServico && <p className="text-xs text-destructive">{errors.valorServico.message}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="aliquota">Alíquota ISS (%)</Label>
              <Input id="aliquota" type="number" step="0.01" min="0" max="100" placeholder="Ex: 5" {...register('aliquota', { valueAsNumber: true })} />
              {errors.aliquota && <p className="text-xs text-destructive">{errors.aliquota.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>ISS Retido</Label>
              <Controller
                name="issRetido"
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
        </CardContent>
      </Card>
      </>)}
      </div>

      <div className={isModal ? 'space-y-5 lg:sticky lg:top-0 lg:self-start' : 'space-y-5'}>
        {/* Alertas de validação — avisos não-bloqueantes */}
        {(() => {
          const avisos: string[] = []
          if (previewTomadorCpf && !isValidCpfCnpj(previewTomadorCpf))
            avisos.push('CPF/CNPJ do tomador parece inválido.')
          if (previewCodigo && !isValidCodigoServico(previewCodigo))
            avisos.push('Código de serviço fora do padrão (ex.: 17.19).')
          if (Number.isFinite(previewAliquota) && Number(previewAliquota) < 2)
            avisos.push('Alíquota abaixo de 2% — confirme com a prefeitura.')
          if (Number.isFinite(previewValor) && Number(previewValor) > 50000)
            avisos.push('Valor acima de R$ 50.000 — verifique se há retenção obrigatória.')
          if (avisos.length === 0) return null
          return (
            <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-warning">Avisos de validação</p>
              {avisos.map(a => (
                <p key={a} className="text-xs text-warning/80 flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">⚠</span>{a}
                </p>
              ))}
            </div>
          )
        })()}

        <Card className={isModal ? 'border-primary/15 bg-gradient-to-b from-primary/[0.06] to-background shadow-none' : 'border-warning/30 bg-warning/5'}>
          <CardHeader>
            <CardTitle className="text-sm">{isModal ? 'Resumo da emissão' : 'Checklist antes da emissão'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <div><span className="text-muted-foreground">Ambiente:</span> Validado na configuração fiscal do cliente</div>
            <div><span className="text-muted-foreground">Prestador:</span> {previewCliente?.razaoSocial ?? 'Selecione o cliente'}</div>
            <div><span className="text-muted-foreground">Competência:</span> {previewCompetencia ? `${String(previewCompetencia.mes).padStart(2, '0')}/${previewCompetencia.ano}` : 'Não vinculada'}</div>
            <div><span className="text-muted-foreground">Serviço:</span> {previewCodigo || 'Informe o código'}</div>
            <div><span className="text-muted-foreground">Valor:</span> {Number.isFinite(previewValor) ? `R$ ${Number(previewValor).toFixed(2)}` : 'Informe o valor'}</div>
            <div><span className="text-muted-foreground">Alíquota:</span> {Number.isFinite(previewAliquota) ? `${Number(previewAliquota)}%` : 'Padrão da configuração'}</div>
            <div><span className="text-muted-foreground">ISS retido:</span> {previewIssRetido ? 'Sim' : 'Não'}</div>
            <div><span className="text-muted-foreground">Credencial/certificado:</span> Validado pela Cloud Function fiscal</div>
          </CardContent>
        </Card>

        <Card className={cardClassByLayout[layout]}>
          <CardHeader>
            <CardTitle className="text-sm">Ações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showResume && allFieldsFilled && (
              <Button type="button" className="w-full justify-center" onClick={handleShowResume}>
                <ChevronRight className="w-4 h-4 mr-2" />
                Revisar antes de emitir
              </Button>
            )}
            {showResume && (
              <Button type="button" className="w-full justify-center" disabled={isLoading} onClick={handleSubmit(solicitarEmissao)}>
                {emitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Emitir NFS-e
              </Button>
            )}
            <Button type="button" variant="outline" className="w-full justify-center" disabled={isLoading || loadingRascunho} onClick={handleSubmit(handleSaveRascunho)}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isEditingRascunho ? 'Liberar para lote' : 'Salvar rascunho'}
            </Button>
            <Button type="button" variant="ghost" className="w-full justify-center" disabled={isLoading} onClick={cancelFlow}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(emissaoPendente)}
        onOpenChange={(open) => {
          if (!open && !emitting) setEmissaoPendente(null)
        }}
        title="Confirmar emissão de NFS-e?"
        description={
          emissaoPendente
            ? (
                <div className="space-y-4">
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/25 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cliente</p>
                      <p className="mt-1 text-sm font-medium">
                        {clientes.find((c) => c.id === emissaoPendente.clienteId)?.razaoSocial ?? emissaoPendente.clienteId}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tomador</p>
                      <p className="mt-1 text-sm font-medium">{emissaoPendente.tomadorNome}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CPF / CNPJ</p>
                      <p className="mt-1 font-mono text-sm">{emissaoPendente.tomadorCpfCnpj}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Código do serviço</p>
                      <p className="mt-1 text-sm font-medium">{emissaoPendente.codigoServico}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Valor</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">
                        R$ {Number(emissaoPendente.valorServico).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ISS retido</p>
                      <p className="mt-1 text-sm font-medium">{emissaoPendente.issRetido ? 'Sim' : 'Não'}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Após confirmar, a solicitação será enviada para a prefeitura e poderá gerar documento fiscal.
                  </p>
                </div>
              )
            : undefined
        }
        confirmLabel="Emitir NFS-e"
        cancelLabel="Revisar dados"
        onConfirm={confirmarEmissao}
      />
    </form>
  )
}
