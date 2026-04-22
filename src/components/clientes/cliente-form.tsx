'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCpfCnpj, formatPhone, formatCep, UFS } from '@/lib/utils'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { createDocument, updateDocument, getNextClienteCodigo } from '@/lib/firestore-client'
import { useViaCep } from '@/hooks/use-viacep'

const clienteSchema = z.object({
  tipoPessoa: z.enum(['pf', 'pj']).default('pj'),
  razaoSocial: z.string().min(2, 'Nome/Razão social obrigatório'),
  nomeFantasia: z.string().optional(),
  cpfCnpj: z.string().min(11, 'CPF/CNPJ inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  regimeTributario: z.enum(['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'isento']).optional().nullable(),
  responsavelNome: z.string().optional(),
  responsavelEmail: z.string().optional(),
  responsavelTelefone: z.string().optional(),
  observacoes: z.string().optional(),
  status: z.enum(['ativo', 'inativo', 'suspenso']).default('ativo'),
})

type ClienteFormData = z.input<typeof clienteSchema>

interface ClienteFormProps {
  initialData?: Partial<ClienteFormData> & { id?: string }
  onSuccess?: (id: string) => void
  onClose?: () => void
}

export function ClienteForm({ initialData, onSuccess, onClose }: ClienteFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id
  const { buscar: buscarCepHook, loading: buscandoCep } = useViaCep()
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [cnpjOk, setCnpjOk] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      tipoPessoa: 'pj',
      status: 'ativo',
      ...initialData,
    },
  })

  const tipoPessoa = watch('tipoPessoa')

  async function buscarCep(cepRaw: string) {
    const resultado = await buscarCepHook(cepRaw)
    if (resultado) {
      if (resultado.logradouro) setValue('logradouro', resultado.logradouro)
      if (resultado.bairro)     setValue('bairro',     resultado.bairro)
      if (resultado.cidade)     setValue('cidade',     resultado.cidade)
      if (resultado.uf)         setValue('uf',         resultado.uf)
    }
  }

  async function buscarCnpj(cnpjRaw: string) {
    const digits = cnpjRaw.replace(/\D/g, '')
    if (digits.length !== 14) return
    setBuscandoCnpj(true)
    setCnpjOk(false)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) return
      const data = await res.json()

      if (data.razao_social)  setValue('razaoSocial',  data.razao_social)
      if (data.nome_fantasia) setValue('nomeFantasia', data.nome_fantasia)
      if (data.email)         setValue('email',        data.email)
      if (data.ddd_telefone_1) {
        setValue('telefone', formatPhone(data.ddd_telefone_1.replace(/\D/g, '')))
      }

      // Endereço
      if (data.cep) {
        const formatted = formatCep(data.cep)
        setValue('cep', formatted)
        await buscarCep(data.cep)
      }
      if (data.logradouro)  setValue('logradouro',  data.logradouro)
      if (data.numero)      setValue('numero',      data.numero)
      if (data.complemento) setValue('complemento', data.complemento)
      if (data.bairro)      setValue('bairro',      data.bairro)
      if (data.municipio)   setValue('cidade',      data.municipio)
      if (data.uf)          setValue('uf',          data.uf)

      setCnpjOk(true)
      toast.success('Dados da empresa preenchidos automaticamente')
    } catch {
      toast.error('Não foi possível buscar dados do CNPJ')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  async function onSubmit(data: ClienteFormData) {
    try {
      if (isEditing) {
        await updateDocument('clientes', initialData!.id!, {
          ...data,
          regimeTributario: data.regimeTributario ?? null,
        })
        toast.success('Cliente atualizado')
        if (onSuccess) {
          onSuccess(initialData!.id!)
        } else {
          router.push(`/clientes/${initialData!.id}`)
          router.refresh()
        }
      } else {
        const codigo = await getNextClienteCodigo()
        const id = await createDocument('clientes', {
          ...data,
          codigo,
          regimeTributario: data.regimeTributario ?? null,
        })
        toast.success('Cliente cadastrado com sucesso!')
        if (onSuccess) {
          onSuccess(id)
        } else {
          router.push(`/clientes/${id}`)
          router.refresh()
        }
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar cliente. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Dados gerais */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Pessoa</Label>
              <Select
                defaultValue={initialData?.tipoPessoa ?? 'pj'}
                onValueChange={(v) => setValue('tipoPessoa', v as 'pf' | 'pj')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                  <SelectItem value="pf">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                defaultValue={initialData?.status ?? 'ativo'}
                onValueChange={(v) => setValue('status', v as 'ativo' | 'inativo' | 'suspenso')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* CNPJ — with auto-fill */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpfCnpj">
                {tipoPessoa === 'pj' ? 'CNPJ' : 'CPF'} *
                {tipoPessoa === 'pj' && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (preenche dados automaticamente)
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="cpfCnpj"
                  {...register('cpfCnpj')}
                  onChange={(e) => {
                    const formatted = formatCpfCnpj(e.target.value)
                    e.target.value = formatted
                    setValue('cpfCnpj', formatted)
                    if (tipoPessoa === 'pj' && formatted.replace(/\D/g, '').length === 14) {
                      buscarCnpj(formatted)
                    }
                  }}
                  maxLength={tipoPessoa === 'pj' ? 18 : 14}
                  className="pr-8"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  {buscandoCnpj && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {cnpjOk && !buscandoCnpj && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                </div>
              </div>
              {errors.cpfCnpj && <p className="text-xs text-destructive">{errors.cpfCnpj.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="regimeTributario">Regime Tributário</Label>
              <Select
                defaultValue={initialData?.regimeTributario ?? ''}
                onValueChange={(v) => setValue('regimeTributario', (v as any) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                  <SelectItem value="isento">Isento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="razaoSocial">
              {tipoPessoa === 'pj' ? 'Razão Social' : 'Nome Completo'} *
            </Label>
            <Input id="razaoSocial" {...register('razaoSocial')} />
            {errors.razaoSocial && <p className="text-xs text-destructive">{errors.razaoSocial.message}</p>}
          </div>

          {tipoPessoa === 'pj' && (
            <div className="space-y-2">
              <Label htmlFor="nomeFantasia">Nome Fantasia</Label>
              <Input id="nomeFantasia" {...register('nomeFantasia')} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                {...register('telefone')}
                onChange={(e) => {
                  e.target.value = formatPhone(e.target.value)
                  setValue('telefone', e.target.value)
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="celular">Celular</Label>
            <Input
              id="celular"
              {...register('celular')}
              onChange={(e) => {
                e.target.value = formatPhone(e.target.value)
                setValue('celular', e.target.value)
              }}
              className="max-w-56"
            />
          </div>
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="space-y-2 w-40">
              <Label htmlFor="cep">
                CEP
                <span className="ml-2 text-xs text-muted-foreground font-normal">(auto-preenche)</span>
              </Label>
              <div className="relative">
                <Input
                  id="cep"
                  {...register('cep')}
                  maxLength={9}
                  className="pr-8"
                  onChange={(e) => {
                    const formatted = formatCep(e.target.value)
                    e.target.value = formatted
                    setValue('cep', formatted)
                    if (formatted.replace(/\D/g, '').length === 8) {
                      buscarCep(formatted)
                    }
                  }}
                />
                {buscandoCep && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="logradouro">Logradouro</Label>
              <Input id="logradouro" {...register('logradouro')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numero">Número</Label>
              <Input id="numero" {...register('numero')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="complemento">Complemento</Label>
              <Input id="complemento" {...register('complemento')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" {...register('bairro')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" {...register('cidade')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">UF</Label>
              <Select
                defaultValue={initialData?.uf ?? ''}
                onValueChange={(v) => setValue('uf', v ?? undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Responsável */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Responsável / Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="responsavelNome">Nome do responsável</Label>
              <Input id="responsavelNome" {...register('responsavelNome')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsavelTelefone">Telefone do responsável</Label>
              <Input id="responsavelTelefone" {...register('responsavelTelefone')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="responsavelEmail">E-mail do responsável</Label>
            <Input id="responsavelEmail" type="email" {...register('responsavelEmail')} className="max-w-80" />
          </div>
        </CardContent>
      </Card>

      {/* Observações */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea {...register('observacoes')} rows={3} placeholder="Notas internas sobre este cliente..." />
        </CardContent>
      </Card>

      {/* Ações */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Cadastrar Cliente'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onClose ? onClose() : router.back()}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
