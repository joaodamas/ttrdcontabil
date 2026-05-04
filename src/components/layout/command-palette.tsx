'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  BarChart3, Users, ClipboardList, Layers,
  FolderOpen, Receipt, FileText, Wallet, Settings,
  Plus, CheckSquare, DollarSign,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Tarefas', href: '/tarefas', icon: ClipboardList },
  { label: 'Competências', href: '/competencias', icon: Layers },
  { label: 'Fechamento Mensal', href: '/fechamento', icon: FolderOpen },
  { label: 'NFS-e / Fiscal', href: '/fiscal', icon: Receipt },
  { label: 'Histórico NFS-e', href: '/fiscal/historico', icon: Receipt },
  { label: 'Imposto de Renda', href: '/ir', icon: FileText },
  { label: 'Financeiro', href: '/financeiro', icon: Wallet },
  { label: 'Admin', href: '/admin', icon: Settings },
  { label: 'Usuários', href: '/admin/usuarios', icon: Users },
]

const QUICK_ACTIONS = [
  { label: 'Novo cliente', href: '/clientes/novo', icon: Plus },
  { label: 'Nova tarefa', href: '/tarefas/nova', icon: CheckSquare },
  { label: 'Nova competência', href: '/competencias/nova', icon: Layers },
  { label: 'Novo lançamento', href: '/financeiro/novo', icon: DollarSign },
  { label: 'Emitir NFS-e', href: '/fiscal/emitir', icon: Receipt },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function handleCustom() { setOpen(true) }
    document.addEventListener('keydown', handleKey)
    window.addEventListener('open-command-palette', handleCustom)
    return () => {
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('open-command-palette', handleCustom)
    }
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas ou ações..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem key={item.href} onSelect={() => go(item.href)} className="gap-2">
                <Icon size={14} className="text-muted-foreground shrink-0" />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ações rápidas">
          {QUICK_ACTIONS.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem key={item.href} onSelect={() => go(item.href)} className="gap-2">
                <Icon size={14} className="text-muted-foreground shrink-0" />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
