'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela, type TelaKey } from '@/lib/permissions'
import {
  Sun,
  Users,
  BriefcaseBusiness,
  Wallet,
  BarChart3,
  Settings,
  Building2,
  LogOut,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getInitials } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  telaKey?: TelaKey
  perfis?: string[]
}

type NavSection = {
  label: string
  items: NavItem[]
  perfis?: string[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { href: '/hoje',      label: 'Hoje',     icon: Sun,         telaKey: 'hoje' },
      { href: '/dashboard', label: 'Dashboard', icon: BarChart3,  telaKey: 'dashboard' },
    ],
  },
  {
    label: 'Carteira',
    items: [
      { href: '/clientes',       label: 'Clientes',         icon: Users,             telaKey: 'clientes' },
      { href: '/admin/servicos', label: 'Tipos de Serviço', icon: BriefcaseBusiness, telaKey: 'servicos' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/competencias', label: 'Competências',      icon: BriefcaseBusiness, telaKey: 'competencias' },
      { href: '/tarefas',      label: 'Tarefas',           icon: BriefcaseBusiness, telaKey: 'tarefas' },
      { href: '/fechamento',   label: 'Fechamento Mensal', icon: BriefcaseBusiness, telaKey: 'fechamento' },
    ],
  },
  {
    label: 'Fiscal',
    items: [
      { href: '/fiscal', label: 'Painel NFS-e',     icon: Wallet, telaKey: 'fiscal' },
      { href: '/ir',     label: 'Imposto de Renda', icon: Wallet, telaKey: 'ir' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/financeiro', label: 'Financeiro',    icon: Wallet,   telaKey: 'financeiro', perfis: ['admin', 'financeiro'] },
      { href: '/admin',      label: 'Administração', icon: Settings, telaKey: 'admin', perfis: ['admin'] },
    ],
  },
]

const COLLAPSED_KEY = 'sidebar-collapsed'

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  })

  function toggleCollapsed() {
    setCollapsed(prev => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev))
      return !prev
    })
  }

  function canSeeItem(item: NavItem) {
    if (item.perfis) {
      if (!usuario) return false
      if (!item.perfis.includes(usuario.perfil)) return false
    }
    if (item.telaKey) return canAccessTela(usuario, item.telaKey)
    return true
  }

  function canSeeSection(section: NavSection) {
    if (!section.perfis) return section.items.some(canSeeItem)
    if (!usuario) return false
    if (!section.perfis.includes(usuario.perfil)) return false
    return section.items.some(canSeeItem)
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className={cn(
        'flex min-h-screen shrink-0 flex-col border-r border-border/70 bg-card/90 backdrop-blur-sm transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-[250px]'
      )}
    >
      {/* Logo row */}
      <div className={cn(
        'flex h-14 items-center border-b border-sidebar-border',
        collapsed ? 'justify-center px-0' : 'px-4 gap-2'
      )}>
        {collapsed ? (
          <Link href="/dashboard">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#F5C200' }}>
              <Building2 className="w-4 h-4" style={{ color: '#0a0a0a' }} />
            </div>
          </Link>
        ) : (
          <>
            <Link href="/dashboard" className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F5C200' }}>
                <Building2 className="w-4 h-4" style={{ color: '#0a0a0a' }} />
              </div>
              <p className="truncate text-sm font-bold text-foreground">
                TTRD <span style={{ color: '#F5C200' }}>Contábil</span>
              </p>
            </Link>
            <Tooltip>
              <TooltipTrigger>
                <button
                  onClick={toggleCollapsed}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Recolher</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center py-2 border-b border-sidebar-border">
          <Tooltip>
            <TooltipTrigger>
              <button
                onClick={toggleCollapsed}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.filter(canSeeSection).map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80 select-none">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.filter(canSeeItem).map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={cn(
                      'group flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                      collapsed && 'justify-center',
                      active
                        ? 'bg-primary/10 text-foreground ring-1 ring-primary/25'
                        : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    )}>
                      <Icon
                        size={15}
                        className={cn(
                          'shrink-0 transition-colors',
                          active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                        )}
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {active && <ChevronRight className="w-3 h-3 text-primary/70 shrink-0" />}
                        </>
                      )}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

      </nav>

      {/* User footer */}
      <div className={cn(
        'border-t border-sidebar-border',
        collapsed ? 'px-2 py-3 flex justify-center' : 'px-3 py-3'
      )}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger>
              <button
                onClick={logout}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair — {usuario?.nome}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2.5 px-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: '#F5C200', color: '#0a0a0a' }}
            >
              {usuario ? getInitials(usuario.nome) : '—'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold leading-tight text-foreground">{usuario?.nome ?? '—'}</p>
              <p className="truncate text-[10px] capitalize leading-tight text-muted-foreground">{usuario?.perfil ?? ''}</p>
            </div>
            <Tooltip>
              <TooltipTrigger>
                <button
                  onClick={logout}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  )
})
