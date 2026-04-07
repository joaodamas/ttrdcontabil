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
import { Separator } from '@/components/ui/separator'
import { formatCpfCnpj, formatPhone, formatCep, UFS } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

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
}

export function ClienteForm({ initialData }: ClienteFormProps) {
  const router = useRouter()
  const isEditing = !!initialData?.id
  const [buscandoCep, setBuscandoCep] = useState(false)

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

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setValue('logradouro', data.logradouro)
        setValue('bairro', data.bairro)
        setValue('cidade', data.localidade)
        setValue('uf', data.uf)
      }
    } catch {}
    finally { setBuscandoCep(false) }
  }

  async function onSubmit(data: ClienteFormData) {
    try {
      const url = isEditing ? `/api/clientes/${initialData?.id}` : '/api/clientes'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao salvar cliente')
        return
      }

      const cliente = await res.json()
      toast.success(isEditing ? 'Cliente atualizado' : 'Cliente cadastrado')
      router.push(`/clientes/${cliente.id}`)
      router.refresh()
    } catch {
      toast.error('Erro de conexão')
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
              <Label htmlFor="cpfCnpj">{tipoPessoa === 'pj' ? 'CNPJ' : 'CPF'} *</Label>
              <Input
                id="cpfCnpj"
                {...register('cpfCnpj')}
                onChange={(e) => {
                  const formatted = formatCpfCnpj(e.target.value)
                  e.target.value = formatted
                  setValue('cpfCnpj', formatted)
                }}
                maxLength={tipoPessoa === 'pj' ? 18 : 14}
              />
              {errors.cpfCnpj && <p className="text-xs text-destructive">{errors.cpfCnpj.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="regimeTributario">Regime Tributário</Label>
              <Select
                defaultValue={initialData?.regimeTributario ?? ''}
                onValueChange={(v) => setValue('regimeTributario', v as any || null)}
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
              <Label htmlFor="cep">CEP</Label>
              <Input
                id="cep"
                {...register('cep')}
                maxLength={9}
                onChange={(e) => {
                  const formatted = formatCep(e.target.value)
                  e.target.value = formatted
                  setValue('cep', formatted)
                  if (formatted.replace(/\D/g, '').length === 8) {
                    buscarCep(formatted)
                  }
                }}
              />
            </div>
            {buscandoCep && <span className="text-xs text-muted-foreground pb-2">Buscando...</span>}
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
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
