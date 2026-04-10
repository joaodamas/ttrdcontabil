'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { updateDocument } from '@/lib/firestore-client'
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
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from '@radix-ui/react-dialog'
import { Loader2, Plus, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const PERFIS = ['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'] as const
type Perfil = typeof PERFIS[number]

const createSchema = z.object({
  nome: z.string().min(2, 'Nome é obrigatório').max(100),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  perfil: z.enum(PERFIS).default('leitura'),
})

const editSchema = z.object({
  nome: z.string().min(2, 'Nome é obrigatório').max(100),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').optional().or(z.literal('')),
  perfil: z.enum(PERFIS).default('leitura'),
  ativo: z.boolean().default(true),
})

type CreateData = z.input<typeof createSchema>
type EditData = z.input<typeof editSchema>

interface UsuarioFormProps {
  usuario?: {
    id: string
    nome?: string
    email?: string
    perfil?: string
    ativo?: boolean
  }
}

const PERFIL_LABELS: Record<Perfil, string> = {
  admin:        'Administrador',
  operacional:  'Operacional',
  fiscal:       'Fiscal',
  financeiro:   'Financeiro',
  leitura:      'Somente Leitura',
}

export function UsuarioForm({ usuario }: UsuarioFormProps) {
  const router = useRouter()
  const isEditing = !!usuario?.id
  const [open, setOpen] = useState(false)

  const schema = isEditing ? editSchema : createSchema
  type FormData = typeof isEditing extends true ? EditData : CreateData

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: isEditing
      ? {
          nome: usuario.nome ?? '',
          email: usuario.email ?? '',
          senha: '',
          perfil: (PERFIS.includes(usuario.perfil as Perfil) ? usuario.perfil : 'leitura') as Perfil,
          ativo: usuario.ativo ?? true,
        }
      : {
          perfil: 'leitura' as Perfil,
          ativo: true,
        },
  })

  async function onSubmit(data: EditData) {
    if (!isEditing) {
      // Criação de usuário requer Firebase Auth Admin — usar o Firebase Console
      // ou implementar via Cloud Function futuramente
      toast.error('Para criar usuários, acesse o Firebase Console e depois edite o perfil aqui.')
      return
    }

    try {
      const updates: Record<string, unknown> = {
        nome: data.nome,
        perfil: data.perfil,
        ativo: data.ativo,
      }

      await updateDocument('usuarios', usuario!.id, updates)

      toast.success('Usuário atualizado!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro ao salvar usuário. Tente novamente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button size="sm" variant="ghost">
            <Pencil className="w-4 h-4 mr-1" />
            Editar
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Novo Usuário
          </Button>
        )}
      </DialogTrigger>

      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-40" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background rounded-lg shadow-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogClose asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input id="nome" {...register('nome')} placeholder="Nome completo" />
              {errors.nome && (
                <p className="text-xs text-destructive">{errors.nome.message}</p>
              )}
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <Label htmlFor="email">
                E-mail <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="usuario@empresa.com"
                disabled={isEditing} // email cannot be changed after creation
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  O e-mail não pode ser alterado.
                </p>
              )}
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="senha">
                Senha{!isEditing && <span className="text-destructive"> *</span>}
                {isEditing && (
                  <span className="text-muted-foreground text-xs"> (deixe em branco para manter)</span>
                )}
              </Label>
              <Input
                id="senha"
                type="password"
                {...register('senha')}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              {errors.senha && (
                <p className="text-xs text-destructive">{errors.senha.message}</p>
              )}
            </div>

            {/* Perfil */}
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Controller
                name="perfil"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERFIS.map((p) => (
                        <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Ativo (only on edit) */}
            {isEditing && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="ativo"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? 'ativo' : 'inativo'}
                      onValueChange={(v) => field.onChange(v === 'ativo')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? 'Salvar Alterações' : 'Criar Usuário'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
