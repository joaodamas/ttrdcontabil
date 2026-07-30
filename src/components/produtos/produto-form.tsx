'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AppModal } from '@/components/ui/app-modal'
import { Loader2, Plus, Pencil, Package } from 'lucide-react'
import { getErrorMessage } from '@/lib/error-message'
import { createProduto, updateProduto } from '@/features/produtos/services'

// Número opcional: '' / null → null; senão Number.
const asNum = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))

const produtoSchema = z.object({
  codigo:      z.string().min(1, 'Código é obrigatório').max(60),
  descricao:   z.string().min(2, 'Descrição é obrigatória').max(200),
  ncm:         z.string().min(8, 'NCM tem 8 dígitos').max(10),
  cfop:        z.string().optional().nullable(),
  unidade:     z.string().min(1, 'Obrigatório').max(6).default('UN'),
  origem:      z.string().optional().nullable(),
  valorUnitario: z.number().min(0).optional().nullable(),
  // ICMS
  icmsCst:     z.string().optional().nullable(),
  icmsCsosn:   z.string().optional().nullable(),
  icmsAliquota: z.number().min(0).max(100).optional().nullable(),
  icmsStBaseRetencao: z.number().min(0).optional().nullable(),
  icmsStValorRetido:  z.number().min(0).optional().nullable(),
  // IPI
  ipiCst:      z.string().optional().nullable(),
  ipiAliquota: z.number().min(0).max(100).optional().nullable(),
  // PIS / COFINS
  pisCst:      z.string().optional().nullable(),
  pisAliquota: z.number().min(0).max(100).optional().nullable(),
  cofinsCst:   z.string().optional().nullable(),
  cofinsAliquota: z.number().min(0).max(100).optional().nullable(),
  ibsCbsCst:   z.string().optional().nullable(),
  cClassTrib:  z.string().optional().nullable(),
  ativo:       z.boolean().default(true),
})

type ProdutoFormData = z.input<typeof produtoSchema>

interface ProdutoFormProps {
  clienteId?: string                     // empresa emissora (obrigatório na criação)
  produto?: Record<string, unknown>      // preenchido na edição
  onSaved?: () => void
}

export function ProdutoForm({ clienteId, produto, onSaved }: ProdutoFormProps) {
  const isEditing = !!produto?.id
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProdutoFormData>({
    resolver: zodResolver(produtoSchema),
    defaultValues: isEditing
      ? {
          codigo:        (produto.codigo as string) ?? '',
          descricao:     (produto.descricao as string) ?? '',
          ncm:           (produto.ncm as string) ?? '',
          cfop:          (produto.cfop as string) ?? '',
          unidade:       (produto.unidade as string) ?? 'UN',
          origem:        (produto.origem as string) ?? '0',
          valorUnitario: produto.valorUnitario != null ? Number(produto.valorUnitario) : undefined,
          icmsCst:       (produto.icmsCst as string) ?? '',
          icmsCsosn:     (produto.icmsCsosn as string) ?? '',
          icmsAliquota:  produto.icmsAliquota != null ? Number(produto.icmsAliquota) : undefined,
          icmsStBaseRetencao: produto.icmsStBaseRetencao != null ? Number(produto.icmsStBaseRetencao) : undefined,
          icmsStValorRetido:  produto.icmsStValorRetido != null ? Number(produto.icmsStValorRetido) : undefined,
          ipiCst:        (produto.ipiCst as string) ?? '',
          ipiAliquota:   produto.ipiAliquota != null ? Number(produto.ipiAliquota) : undefined,
          pisCst:        (produto.pisCst as string) ?? '',
          pisAliquota:   produto.pisAliquota != null ? Number(produto.pisAliquota) : undefined,
          cofinsCst:     (produto.cofinsCst as string) ?? '',
          cofinsAliquota: produto.cofinsAliquota != null ? Number(produto.cofinsAliquota) : undefined,
          ibsCbsCst:     (produto.ibsCbsCst as string) ?? '',
          cClassTrib:    (produto.cClassTrib as string) ?? '',
          ativo:         produto.ativo !== false,
        }
      : { unidade: 'UN', origem: '0', ativo: true },
  })

  async function onSubmit(data: ProdutoFormData) {
    try {
      if (isEditing) {
        await updateProduto(produto!.id as string, data as Record<string, unknown>)
        toast.success('Produto atualizado!')
      } else {
        if (!clienteId) {
          toast.error('Selecione a empresa emissora antes de cadastrar o produto.')
          return
        }
        await createProduto({ ...(data as Record<string, unknown>), clienteId })
        toast.success('Produto criado!')
      }
      setOpen(false)
      reset()
      onSaved?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o produto. Verifique os dados e sua permissão de acesso.'))
    }
  }

  return (
    <>
      {isEditing ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Pencil className="w-4 h-4 mr-1" />
          Editar
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Novo Produto
        </Button>
      )}

      <AppModal
        open={open}
        onOpenChange={setOpen}
        title={isEditing ? 'Editar Produto' : 'Novo Produto'}
        description="Ficha fiscal do produto para NF-e/NFC-e. Preencha conforme o regime da empresa emissora — a Spedy transmite o que for informado aqui."
        icon={<Package className="size-4" />}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* ── Identificação ── */}
          <div className="space-y-3">
            <p className="section-label">Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código <span className="text-destructive">*</span></Label>
                <Input id="codigo" {...register('codigo')} placeholder="Ex: P001" className="font-mono" />
                {errors.codigo && <p className="text-xs text-destructive">{errors.codigo.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unidade">Unidade <span className="text-destructive">*</span></Label>
                <Input id="unidade" {...register('unidade')} placeholder="UN" className="uppercase" />
                {errors.unidade && <p className="text-xs text-destructive">{errors.unidade.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição <span className="text-destructive">*</span></Label>
              <Input id="descricao" {...register('descricao')} placeholder="Descrição do produto" />
              {errors.descricao && <p className="text-xs text-destructive">{errors.descricao.message}</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ncm">NCM <span className="text-destructive">*</span></Label>
                <Input id="ncm" {...register('ncm')} placeholder="00000000" className="font-mono" />
                {errors.ncm && <p className="text-xs text-destructive">{errors.ncm.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfop">CFOP</Label>
                <Input id="cfop" {...register('cfop')} placeholder="5102" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Controller
                  name="origem"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? '0'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 · Nacional</SelectItem>
                        <SelectItem value="1">1 · Estrangeira (import. direta)</SelectItem>
                        <SelectItem value="2">2 · Estrangeira (merc. interno)</SelectItem>
                        <SelectItem value="3">3 · Nacional (import. &gt; 40%)</SelectItem>
                        <SelectItem value="8">8 · Nacional (import. &gt; 70%)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorUnitario">Valor unitário padrão (R$)</Label>
              <Input id="valorUnitario" type="number" step="0.01" min="0" placeholder="0,00"
                {...register('valorUnitario', { setValueAs: asNum })} />
            </div>
          </div>

          {/* ── Tributação ── */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <p className="section-label">Tributação</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Preencha <b>CST</b> (Lucro Presumido/Real) <b>ou</b> CSOSN (Simples Nacional) do ICMS. ST só quando houver substituição tributária.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="icmsCst">ICMS · CST</Label>
                <Input id="icmsCst" {...register('icmsCst')} placeholder="00" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="icmsCsosn">ICMS · CSOSN</Label>
                <Input id="icmsCsosn" {...register('icmsCsosn')} placeholder="102" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="icmsAliquota">ICMS · alíq. (%)</Label>
                <Input id="icmsAliquota" type="number" step="0.01" min="0" placeholder="18"
                  {...register('icmsAliquota', { setValueAs: asNum })} className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="icmsStBaseRetencao">ICMS-ST · base retenção (R$)</Label>
                <Input id="icmsStBaseRetencao" type="number" step="0.01" min="0" placeholder="0,00"
                  {...register('icmsStBaseRetencao', { setValueAs: asNum })} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="icmsStValorRetido">ICMS-ST · valor retido (R$)</Label>
                <Input id="icmsStValorRetido" type="number" step="0.01" min="0" placeholder="0,00"
                  {...register('icmsStValorRetido', { setValueAs: asNum })} className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ipiCst">IPI · CST</Label>
                <Input id="ipiCst" {...register('ipiCst')} placeholder="53" className="font-mono" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="ipiAliquota">IPI · alíquota (%)</Label>
                <Input id="ipiAliquota" type="number" step="0.01" min="0" placeholder="0"
                  {...register('ipiAliquota', { setValueAs: asNum })} className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pisCst">PIS · CST</Label>
                  <Input id="pisCst" {...register('pisCst')} placeholder="01" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pisAliquota">PIS %</Label>
                  <Input id="pisAliquota" type="number" step="0.0001" min="0" placeholder="1,65"
                    {...register('pisAliquota', { setValueAs: asNum })} className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cofinsCst">COFINS · CST</Label>
                  <Input id="cofinsCst" {...register('cofinsCst')} placeholder="01" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cofinsAliquota">COFINS %</Label>
                  <Input id="cofinsAliquota" type="number" step="0.0001" min="0" placeholder="7,6"
                    {...register('cofinsAliquota', { setValueAs: asNum })} className="font-mono" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Reforma Tributária ── */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <p className="section-label">Reforma Tributária (IBS/CBS)</p>
              <p className="text-[11px] text-amber-600 mt-1">
                ⚠ Ainda não é enviado ao emissor — a Spedy ainda não aceita esses campos na API de NF-e.
                Preencha pra deixar pronto; a transmissão real depende do provedor liberar isso do lado deles.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ibsCbsCst">CST da Reforma</Label>
                <Input id="ibsCbsCst" {...register('ibsCbsCst')} placeholder="Ex: 000" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cClassTrib">Classificação Tributária (cClassTrib)</Label>
                <Input id="cClassTrib" {...register('cClassTrib')} placeholder="Ex: 000001" className="font-mono" />
              </div>
            </div>
          </div>

          {isEditing && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                name="ativo"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ? 'ativo' : 'inativo'} onValueChange={(v) => field.onChange(v === 'ativo')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Produto'}
            </Button>
          </div>
        </form>
      </AppModal>
    </>
  )
}
