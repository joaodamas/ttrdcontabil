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
import { getErrorMessage } from '@/lib/error-message'
import { atualizarUsuarioAdmin, criarUsuarioAdmin, enviarConviteSenha } from '@/features/admin/services'
import { useAuth } from '@/contexts/auth-context'
import { PERFIS, PERFIL_LABELS, PERFIL_DEFAULT_TELAS, TELAS, type Perfil, type TelaKey } from '@/lib/permissions'

/* ─── Telas disponíveis ───────────────────────────────────── */
// Rótulos da tela de usuários; as chaves e os padrões por perfil vêm da fonte
// única (functions/src/usuarios/perfis.ts, reexportada por permissions.ts).
export const TELAS_LIST: { key: TelaKey; label: string; desc: string }[] = [
  { key: 'hoje',         label: 'Hoje',                 desc: 'Prioridades do dia com ação rápida' },
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
].filter((t): t is { key: TelaKey; label: string; desc: string } => (TELAS as readonly string[]).includes(t.key))

const defaultTelas = (perfil: Perfil): string[] => [...PERFIL_DEFAULT_TELAS[perfil]]

/* ─── Schemas ─────────────────────────────────────────────── */
// Sem campo de senha: o usuário novo recebe o e-mail de convite e define a
// própria senha — o admin nunca a conhece.
const createSchema = z.object({
  nome:   z.string().min(2, 'Nome é obrigatório').max(100),
  email:  z.string().email('E-mail inválido'),
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
    tenantId?: string
  }
  onSaved?: () => void
  /** Controle externo do diálogo (ex.: clicar na linha da lista abre a edição). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/* ─── Component ───────────────────────────────────────────── */
export function UsuarioForm({ usuario, onSaved, open: openControlado, onOpenChange }: UsuarioFormProps) {
  const isEditing = !!usuario?.id
  const [openInterno, setOpenInterno] = useState(false)
  const open = openControlado ?? openInterno
  const setOpen = (v: boolean) => {
    if (openControlado === undefined) setOpenInterno(v)
    onOpenChange?.(v)
  }

  const { usuario: usuarioLogado } = useAuth()
  const isSelf = isEditing && !!usuarioLogado && usuarioLogado.uid === usuario?.id

  const defaultPerfil = isEditing
    ? ((PERFIS.includes(usuario?.perfil as Perfil) ? usuario?.perfil : 'leitura') as Perfil)
    : ('leitura' as Perfil)

  // Telas personalizadas do usuário são preservadas ao abrir a edição. Lista
  // vazia/ausente = padrão do perfil (canAccessTela), então mostra o padrão.
  const telasIniciais = isEditing && usuario?.telas && usuario.telas.length > 0
    ? usuario.telas
    : defaultTelas(defaultPerfil)

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
      ? { nome: usuario.nome ?? '', email: usuario.email ?? '', perfil: defaultPerfil, ativo: usuario.ativo !== false, telas: telasIniciais }
      : { perfil: 'leitura' as Perfil, telas: defaultTelas('leitura') },
  })

  const selectedTelas  = watch('telas') as string[]

  // Padrões do perfil só quando o admin TROCA o perfil nesta edição. Antes era um
  // useEffect em `perfil`, que rodava ao abrir o formulário e sobrescrevia as
  // telas personalizadas do usuário com as do perfil — salvar apagava o ajuste.
  function trocarPerfil(perfil: Perfil, onChange: (v: Perfil) => void) {
    onChange(perfil)
    setValue('telas', defaultTelas(perfil))
  }

  function toggleTela(key: string) {
    const current = selectedTelas ?? []
    setValue(
      'telas',
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    )
  }

  function selectAll()   { setValue('telas', [...TELAS]) }
  function selectNone()  { setValue('telas', []) }

  async function onSubmit(data: EditData) {
    try {
      if (isEditing) {
        // O servidor também barra (último admin, autodesativação); aqui é só
        // para o admin não perder o clique.
        if (isSelf && (data.perfil !== 'admin' || data.ativo === false)) {
          toast.error('Você não pode rebaixar o perfil nem inativar o seu próprio usuário.')
          return
        }

        await atualizarUsuarioAdmin(usuario!.id, {
          nome:   data.nome,
          perfil: data.perfil,
          ativo:  data.ativo,
          telas:  data.telas,
        })
        toast.success('Usuário atualizado!')
      } else {
        const criado = await criarUsuarioAdmin({
          nome:   data.nome,
          email:  (data as CreateData).email,
          perfil: data.perfil ?? 'leitura',
          telas:  data.telas ?? [],
        })
        try {
          await enviarConviteSenha(criado.email)
          toast.success(`Usuário ${data.nome} criado. Convite enviado para ${criado.email} — o link serve para definir a senha.`)
        } catch (err) {
          console.error('[usuarios] convite', err)
          toast.warning(`Usuário ${data.nome} criado, mas o e-mail de convite não saiu. Use "Reenviar convite" na lista.`)
        }
        if (criado.contaReaproveitada) {
          toast.info('Este e-mail já tinha uma conta de login sem perfil: ela foi reaproveitada, com a senha antiga anulada.')
        }
      }

      setOpen(false)
      reset()
      onSaved?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o usuário. Verifique seu perfil de acesso e os dados obrigatórios.'))
      console.error(err)
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
          <Button size="cta" className="cursor-pointer">
            <Plus /> Novo usuário
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
                  <Label htmlFor="nome" required>Nome completo</Label>
                  <Input id="nome" {...register('nome')} placeholder="João da Silva" />
                  {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" required>E-mail</Label>
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
                <p className="text-xs text-muted-foreground">
                  O usuário recebe por e-mail um link para definir a própria senha. Ninguém mais a conhece.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Perfil de acesso</Label>
                  <Controller
                    name="perfil"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => trocarPerfil(v as Perfil, field.onChange)} disabled={isSelf}>
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
                          disabled={isSelf}
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

              {isSelf && (
                <p className="text-xs text-muted-foreground">
                  Você está editando o seu próprio usuário: não é possível alterar o perfil ou inativar sua conta por aqui.
                </p>
              )}
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
                {isEditing ? 'Salvar Alterações' : 'Criar e enviar convite'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
