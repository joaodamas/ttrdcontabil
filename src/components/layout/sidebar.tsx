'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarDays,
  CheckSquare,
  FileText,
  DollarSign,
  Receipt,
  FolderOpen,
  Settings,
  Building2,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getInitials } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  perfis?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/servicos', label: 'Serviços', icon: Briefcase },
  { href: '/competencias', label: 'Competências', icon: CalendarDays },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/ir', label: 'Imp. de Renda', icon: FileText },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/fiscal', label: 'Fiscal / NFS-e', icon: Receipt, perfis: ['admin', 'fiscal', 'financeiro'] },
  { href: '/documentos', label: 'Documentos', icon: FolderOpen },
  { href: '/admin', label: 'Administração', icon: Settings, perfis: ['admin'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()

  const itemsVisiveis = NAV_ITEMS.filter(
    (item) => !item.perfis || item.perfis.includes(usuario.perfil)
  )

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">
            TTRD Contábil
          </p>
          <p className="text-xs text-sidebar-foreground/60 truncate">Gestão</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {itemsVisiveis.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0',
                    isActive ? 'text-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70'
                  )}
                />
                {item.label}
                {isActive && <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Usuário / Logout */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
            {getInitials(usuario.nome)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{usuario.nome}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize truncate">{usuario.perfil}</p>
          </div>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 text-sidebar-foreground/50 hover:text-destructive shrink-0"
                onClick={logout}
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
