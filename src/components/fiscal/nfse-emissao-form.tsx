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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Loader2, Save, Send } from 'lucide-react'
import { getClientes, getCompetencias, createDocument, getDocument, updateDocument } from '@/lib/firestore-client'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { SELECT_NONE_VALUE } from '@/lib/select-values'

const nfseSchema = z.object({
  clienteId:        z.string().min(1, 'Cliente é obrigatório'),
  competenciaId:    z.string().optional().nullable(),
  tomadorNome:      z.string().min(1, 'Nome do tomador é obrigatório').max(150),
  tomadorCpfCnpj:   z.string().min(11, 'CPF/CNPJ inválido').max(18),
  tomadorEmail:     z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  descricaoServico: z.string().min(1, 'Descrição do serviço é obrigatória').max(500),
  codigoServico:    z.string().min(1, 'Código do serviço é obrigatório').max(20),
  valorServico:     z.number().positive('Valor deve ser positivo'),
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

export function NfseEmissaoForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clienteIdParam = searchParams.get('clienteId') ?? ''
  const rascunhoIdParam = searchParams.get('rascunhoId') ?? ''

  const [clientes,           setClientes]           = useState<Cliente[]>([])
  const [competencias,       setCompetencias]       = useState<Competencia[]>([])
  const [loadingClientes,    setLoadingClientes]    = useState(true)
  const [loadingCompetencias,setLoadingCompetencias]= useState(false)
  const [loadingRascunho, setLoadingRascunho] = useState(Boolean(rascunhoIdParam))
  const [rascunhoAtual, setRascunhoAtual] = useState<RascunhoNfse | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [emitting, setEmitting] = useState(false)
  const [emissaoPendente, setEmissaoPendente] = useState<NfseFormData | null>(null)

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
      router.push('/fiscal')
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
        router.push('/fiscal')
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

  return (
    <form className="space-y-5">
      {loadingRascunho ? (
        <div className="flex items-center justify-center rounded-xl border py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}
      {/* Vínculo */}
      <Card className={loadingRascunho ? 'pointer-events-none opacity-60' : undefined}>
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
      <Card>
        <CardHeader><CardTitle className="text-sm">Dados do Tomador</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tomadorNome">Nome / Razão Social <span className="text-destructive">*</span></Label>
            <Input id="tomadorNome" {...register('tomadorNome')} placeholder="Nome completo ou razão social" />
            {errors.tomadorNome && <p className="text-xs text-destructive">{errors.tomadorNome.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tomadorCpfCnpj">CPF / CNPJ <span className="text-destructive">*</span></Label>
              <Input id="tomadorCpfCnpj" {...register('tomadorCpfCnpj')} placeholder="000.000.000-00" />
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
      <Card>
        <CardHeader><CardTitle className="text-sm">Serviço</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="descricaoServico">Descrição do Serviço <span className="text-destructive">*</span></Label>
            <Textarea id="descricaoServico" rows={3} {...register('descricaoServico')} placeholder="Descreva o serviço prestado conforme contrato..." />
            {errors.descricaoServico && <p className="text-xs text-destructive">{errors.descricaoServico.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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

      <Card className="border-warning/30 bg-warning/5">
        <CardHeader><CardTitle className="text-sm">Checklist antes da emissão</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
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

      {/* Ações */}
      <div className="flex items-center gap-3">
        <Button type="button" disabled={isLoading || loadingRascunho} onClick={handleSubmit(solicitarEmissao)}>
          {emitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Emitir (Assistida)
        </Button>
        <Button type="button" variant="outline" disabled={isLoading || loadingRascunho} onClick={handleSubmit(handleSaveRascunho)}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {isEditingRascunho ? 'Liberar para lote' : 'Salvar Rascunho'}
        </Button>
        <Button type="button" variant="ghost" disabled={isLoading} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(emissaoPendente)}
        onOpenChange={(open) => {
          if (!open && !emitting) setEmissaoPendente(null)
        }}
        title="Confirmar emissão de NFS-e?"
        description={
          emissaoPendente
            ? [
                `Cliente: ${clientes.find((c) => c.id === emissaoPendente.clienteId)?.razaoSocial ?? emissaoPendente.clienteId}.`,
                `Tomador: ${emissaoPendente.tomadorNome}.`,
                `CPF/CNPJ: ${emissaoPendente.tomadorCpfCnpj}.`,
                `Serviço: ${emissaoPendente.codigoServico}.`,
                `Valor: R$ ${Number(emissaoPendente.valorServico).toFixed(2)}.`,
                `ISS retido: ${emissaoPendente.issRetido ? 'Sim' : 'Não'}.`,
                'Após confirmar, a solicitação será enviada para a prefeitura e poderá gerar documento fiscal.',
              ].join(' ')
            : undefined
        }
        confirmLabel="Emitir NFS-e"
        cancelLabel="Revisar dados"
        onConfirm={confirmarEmissao}
      />
    </form>
  )
}
