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
import { Loader2, Save, Send } from 'lucide-react'

const nfseSchema = z.object({
  clienteId: z.string().min(1, 'Cliente é obrigatório'),
  competenciaId: z.string().optional().nullable(),
  tomadorNome: z.string().min(1, 'Nome do tomador é obrigatório').max(150),
  tomadorCpfCnpj: z.string().min(11, 'CPF/CNPJ inválido').max(18),
  tomadorEmail: z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  descricaoServico: z.string().min(1, 'Descrição do serviço é obrigatória').max(500),
  codigoServico: z.string().min(1, 'Código do serviço é obrigatório').max(20),
  valorServico: z.number().positive('Valor deve ser positivo'),
  aliquota: z.number().min(0).max(100).optional().nullable(),
  issRetido: z.boolean().default(false),
})

type NfseFormData = z.input<typeof nfseSchema>

interface Cliente {
  id: string
  razaoSocial: string
  cpfCnpj?: string
  email?: string
}

interface Competencia {
  id: string
  mes: number
  ano: number
  servicoNome?: string
}

export function NfseEmissaoForm() {
  const router = useRouter()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [competencias, setCompetencias] = useState<Competencia[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [loadingCompetencias, setLoadingCompetencias] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emitting, setEmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NfseFormData>({
    resolver: zodResolver(nfseSchema),
    defaultValues: {
      issRetido: false,
    },
  })

  const selectedClienteId = watch('clienteId')

  useEffect(() => {
    async function loadClientes() {
      try {
        const res = await fetch('/api/clientes?status=ativo')
        const { clientes: c } = await res.json()
        setClientes(c ?? [])
      } catch {
        toast.error('Erro ao carregar clientes')
      } finally {
        setLoadingClientes(false)
      }
    }
    loadClientes()
  }, [])

  useEffect(() => {
    if (!selectedClienteId) {
      setCompetencias([])
      return
    }

    // Auto-fill tomador from client data
    const cliente = clientes.find((c) => c.id === selectedClienteId)
    if (cliente) {
      setValue('tomadorNome', cliente.razaoSocial)
      if (cliente.cpfCnpj) setValue('tomadorCpfCnpj', cliente.cpfCnpj)
      if (cliente.email) setValue('tomadorEmail', cliente.email)
    }

    // Load competencias for this client
    setLoadingCompetencias(true)
    fetch(`/api/competencias?clienteId=${selectedClienteId}&status=em_andamento`)
      .then((r) => r.json())
      .then(({ competencias: comp }) => {
        setCompetencias(comp ?? [])
      })
      .catch(() => toast.error('Erro ao carregar competências'))
      .finally(() => setLoadingCompetencias(false))
  }, [selectedClienteId, clientes, setValue])

  async function buildPayload(data: NfseFormData, emitir: boolean) {
    return {
      clienteId: data.clienteId,
      competenciaId: data.competenciaId ?? null,
      tomadorNome: data.tomadorNome,
      tomadorCpfCnpj: data.tomadorCpfCnpj.replace(/\D/g, ''),
      tomadorEmail: data.tomadorEmail || null,
      descricaoServico: data.descricaoServico,
      codigoServico: data.codigoServico,
      valorServico: data.valorServico,
      aliquota: data.aliquota ?? null,
      issRetido: data.issRetido,
      tipoIntegracao: emitir ? 'manual_assistido' : 'rascunho',
    }
  }

  async function handleSaveRascunho(data: NfseFormData) {
    setSaving(true)
    try {
      const payload = await buildPayload(data, false)
      const res = await fetch('/api/nfse/rascunhos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: data.clienteId,
          competenciaId: data.competenciaId ?? null,
          titulo: `NFS-e — ${data.tomadorNome}`,
          dados: payload,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao salvar rascunho')
        return
      }

      toast.success('Rascunho salvo com sucesso!')
      router.push('/fiscal')
      router.refresh()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleEmitir(data: NfseFormData) {
    setEmitting(true)
    try {
      const payload = await buildPayload(data, true)
      const res = await fetch('/api/nfse/emitidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao emitir NFS-e')
        return
      }

      const result = await res.json()
      toast.success('NFS-e emitida com sucesso!')
      router.push(`/fiscal/historico`)
      router.refresh()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setEmitting(false)
    }
  }

  const isLoading = saving || emitting

  return (
    <form className="space-y-5">
      {/* Vínculo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Vínculo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  disabled={loadingClientes}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loadingClientes ? 'Carregando...' : 'Selecione o cliente'}
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
          </div>

          <div className="space-y-1.5">
            <Label>Competência (opcional)</Label>
            <Controller
              name="competenciaId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v || null)}
                  disabled={loadingCompetencias || !selectedClienteId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedClienteId
                          ? 'Selecione um cliente primeiro'
                          : loadingCompetencias
                          ? 'Carregando...'
                          : 'Selecione a competência'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma</SelectItem>
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
        <CardHeader>
          <CardTitle className="text-sm">Dados do Tomador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tomadorNome">
              Nome / Razão Social <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tomadorNome"
              {...register('tomadorNome')}
              placeholder="Nome completo ou razão social"
            />
            {errors.tomadorNome && (
              <p className="text-xs text-destructive">{errors.tomadorNome.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tomadorCpfCnpj">
                CPF / CNPJ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tomadorCpfCnpj"
                {...register('tomadorCpfCnpj')}
                placeholder="000.000.000-00"
              />
              {errors.tomadorCpfCnpj && (
                <p className="text-xs text-destructive">{errors.tomadorCpfCnpj.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tomadorEmail">E-mail</Label>
              <Input
                id="tomadorEmail"
                type="email"
                {...register('tomadorEmail')}
                placeholder="tomador@email.com"
              />
              {errors.tomadorEmail && (
                <p className="text-xs text-destructive">{errors.tomadorEmail.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Serviço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Serviço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="descricaoServico">
              Descrição do Serviço <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="descricaoServico"
              rows={3}
              {...register('descricaoServico')}
              placeholder="Descreva o serviço prestado conforme contrato..."
            />
            {errors.descricaoServico && (
              <p className="text-xs text-destructive">{errors.descricaoServico.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="codigoServico">
                Código do Serviço <span className="text-destructive">*</span>
              </Label>
              <Input
                id="codigoServico"
                {...register('codigoServico')}
                placeholder="Ex: 17.19"
              />
              {errors.codigoServico && (
                <p className="text-xs text-destructive">{errors.codigoServico.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="valorServico">
                Valor do Serviço (R$) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="valorServico"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                {...register('valorServico')}
              />
              {errors.valorServico && (
                <p className="text-xs text-destructive">{errors.valorServico.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="aliquota">Alíquota ISS (%)</Label>
              <Input
                id="aliquota"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Ex: 5"
                {...register('aliquota')}
              />
              {errors.aliquota && (
                <p className="text-xs text-destructive">{errors.aliquota.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>ISS Retido</Label>
              <Controller
                name="issRetido"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ? 'sim' : 'nao'}
                    onValueChange={(v) => field.onChange(v === 'sim')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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

      {/* Ações */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={isLoading}
          onClick={handleSubmit(handleEmitir)}
        >
          {emitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Emitir (Assistida)
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={handleSubmit(handleSaveRascunho)}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Rascunho
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={isLoading}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
