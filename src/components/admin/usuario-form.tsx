'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { initializeApp, deleteApp, getApps } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { getClientDb, firebaseConfig } from '@/lib/firebase'
import { updateDocument, invalidateUsuariosCache } from '@/lib/firestore-client'
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
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from '@radix-ui/react-dialog'
import { Loader2, Plus, Pencil, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── Perfis ──────────────────────────────────────────────── */
const PERFIS = ['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'] as const
type Perfil = typeof PERFIS[number]

const PERFIL_LABELS: Record<Perfil, string> = {
  admin:       'Administrador',
  operacional: 'Operacional',
  fiscal:      'Fiscal',
  financeiro:  'Financeiro',
  leitura:     'Somente Leitura',
}

/* ─── Telas disponíveis ───────────────────────────────────── */
export const TELAS_LIST = [
  { key: 'dashboard',    label: 'Início / Dashboard',   desc: 'Visão geral do sistema' },
  { key: 'clientes',     label: 'Clientes',              desc: 'Cadastro e gestão de clientes' },
  { key: 'servicos',     label: 'Tipos de Serviço',      desc: 'Configuração de serviços (admin)' },
  { key: 'competencias', label: 'Competências',          desc: 'Competências fiscais mensais' },
  { key: 'tarefas',      label: 'Tarefas',               desc: 'Controle de tarefas da equipe' },
  { key: 'fechamento',   label: 'Fechamento Mensal',     desc: 'Controle de fechamento por cliente' },
  { key: 'fiscal',       label: 'Painel NFS-e',          desc: 'Emissão e consulta de notas fiscais' },
  { key: 'ir',           label: 'Imposto de Renda',      desc: 'Gestão de declarações de IR' },
  { key: 'financeiro',   label: 'Financeiro',            desc: 'Lançamentos e fluxo de caixa' },
  { key: 'admin',        label: 'Administração',         desc: 'Usuários, serviços e configurações' },
]

const DEFAULT_TELAS: Record<Perfil, string[]> = {
  admin:       TELAS_LIST.map((t) => t.key),
  operacional: ['dashboard', 'clientes', 'competencias', 'tarefas', 'fechamento'],
  fiscal:      ['dashboard', 'clientes', 'competencias', 'tarefas', 'fechamento', 'fiscal', 'ir'],
  financeiro:  ['dashboard', 'clientes', 'financeiro'],
  leitura:     ['dashboard', 'clientes', 'competencias', 'tarefas'],
}

/* ─── Schemas ─────────────────────────────────────────────── */
const createSchema = z.object({
  nome:   z.string().min(2, 'Nome é obrigatório').max(100),
  email:  z.string().email('E-mail inválido'),
  senha:  z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  perfil: z.enum(PERFIS).default('leitura'),
  telas:  z.array(z.string()).default([]),
})

const editSchema = z.object({
  nome:   z.string().min(2, 'Nome é obrigatório').max(100),
  email:  z.string().email('E-mail inválido'),
  perfil: z.enum(PERFIS).default('leitura'),
  ativo:  z.boolean().default(true),
  telas:  z.array(z.string()).default([]),
})

type CreateData = z.input<typeof createSchema>
type EditData   = z.input<typeof editSchema>

/* ─── Props ───────────────────────────────────────────────── */
interface UsuarioFormProps {
  usuario?: {
    id: string
    nome?: string
    email?: string
    perfil?: string
    ativo?: boolean
    telas?: string[]
  }
  onSaved?: () => void
}

/* ─── Component ───────────────────────────────────────────── */
export function UsuarioForm({ usuario, onSaved }: UsuarioFormProps) {
  const db = getClientDb()
  const isEditing = !!usuario?.id
  const [open, setOpen] = useState(false)

  const defaultPerfil = isEditing
    ? ((PERFIS.includes(usuario?.perfil as Perfil) ? usuario?.perfil : 'leitura') as Perfil)
    : ('leitura' as Perfil)

  const defaultTelas = isEditing
    ? (usuario?.telas ?? DEFAULT_TELAS[defaultPerfil])
    : DEFAULT_TELAS['leitura']

  const schema = isEditing ? editSchema : createSchema

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: isEditing
      ? { nome: usuario.nome ?? '', email: usuario.email ?? '', perfil: defaultPerfil, ativo: usuario.ativo ?? true, telas: defaultTelas }
      : { perfil: 'leitura' as Perfil, telas: DEFAULT_TELAS['leitura'] },
  })

  const selectedPerfil = watch('perfil') as Perfil
  const selectedTelas  = watch('telas') as string[]

  // When profile changes, auto-update telas to defaults (only on create, or if user hasn't customized)
  useEffect(() => {
    if (selectedPerfil && DEFAULT_TELAS[selectedPerfil]) {
      setValue('telas', DEFAULT_TELAS[selectedPerfil])
    }
  }, [selectedPerfil, setValue])

  function toggleTela(key: string) {
    const current = selectedTelas ?? []
    setValue(
      'telas',
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    )
  }

  function selectAll()   { setValue('telas', TELAS_LIST.map((t) => t.key)) }
  function selectNone()  { setValue('telas', []) }

  async function onSubmit(data: EditData) {
    try {
      if (isEditing) {
        await updateDocument('usuarios', usuario!.id, {
          nome:   data.nome,
          perfil: data.perfil,
          ativo:  data.ativo,
          telas:  data.telas,
        })
        toast.success('Usuário atualizado!')
      } else {
        // Create Firebase Auth user via secondary app (doesn't sign out admin)
        const appName = `user-creation-${Date.now()}`
        const secondaryApp = initializeApp(firebaseConfig, appName)
        try {
          const secondaryAuth = getAuth(secondaryApp)
          const cred = await createUserWithEmailAndPassword(
            secondaryAuth,
            (data as CreateData).email,
            (data as CreateData).senha
          )
          await fbSignOut(secondaryAuth)

          // Save Firestore profile
          await setDoc(doc(db, 'usuarios', cred.user.uid), {
            nome:           data.nome,
            email:          (data as CreateData).email,
            perfil:         data.perfil,
            telas:          data.telas,
            ativo:          true,
            criadoEm:       new Date(),
            atualizadoEm:   new Date(),
          })

          toast.success(`Usuário ${data.nome} criado com sucesso!`)
        } finally {
          // Clean up secondary app (ignore errors if already cleaned)
          try { await deleteApp(secondaryApp) } catch {}
        }
      }

      invalidateUsuariosCache()
      setOpen(false)
      reset()
      onSaved?.()
    } catch (err) {
      const msg = (err as { message?: string }).message ?? ''
      if (msg.includes('email-already-in-use')) {
        toast.error('Este e-mail já está cadastrado.')
      } else if (msg.includes('weak-password')) {
        toast.error('Senha muito fraca. Use ao menos 6 caracteres.')
      } else {
        toast.error('Erro ao salvar usuário. Tente novamente.')
        console.error(err)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button size="sm" variant="ghost" className="cursor-pointer">
            <Pencil className="w-4 h-4 mr-1" /> Editar
          </Button>
        ) : (
          <Button size="sm" className="cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> Novo Usuário
          </Button>
        )}
      </DialogTrigger>

      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-40" />
        <DialogContent
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background rounded-xl shadow-2xl"
          style={{ border: '1px solid rgba(0,0,0,0.12)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle className="text-base font-semibold">
              {isEditing ? `Editar — ${usuario?.nome}` : 'Novo Usuário'}
            </DialogTitle>
            <DialogClose asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer">
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Dados básicos */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Dados do usuário</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome completo <span className="text-destructive">*</span></Label>
                  <Input id="nome" {...register('nome')} placeholder="João da Silva" />
                  {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail <span className="text-destructive">*</span></Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="usuario@ttrd.com.br"
                    disabled={isEditing}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  {isEditing && <p className="text-xs text-muted-foreground">E-mail não pode ser alterado.</p>}
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha <span className="text-destructive">*</span></Label>
                  <Input id="senha" type="password" {...register('senha' as keyof EditData)} placeholder="••••••••" autoComplete="new-password" />
                  {(errors as Record<string, { message?: string }>).senha && (
                    <p className="text-xs text-destructive">{(errors as Record<string, { message?: string }>).senha?.message}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Perfil de acesso</Label>
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
              </div>
            </div>

            {/* Permissões de tela */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Telas com acesso
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    Todas
                  </button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-xs text-muted-foreground hover:underline cursor-pointer"
                  >
                    Nenhuma
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TELAS_LIST.map((tela) => {
                  const active = (selectedTelas ?? []).includes(tela.key)
                  return (
                    <button
                      key={tela.key}
                      type="button"
                      onClick={() => toggleTela(tela.key)}
                      className={cn(
                        'flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer',
                        active
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border-2 transition-colors',
                        active ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                      )}>
                        {active && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{tela.label}</p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{tela.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                {(selectedTelas ?? []).length} de {TELAS_LIST.length} telas habilitadas
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t">
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm" className="cursor-pointer">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isSubmitting} className="cursor-pointer">
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
