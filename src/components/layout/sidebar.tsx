'use client'

import { memo, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CheckSquare,
  FileText,
  DollarSign,
  Receipt,
  Settings,
  Building2,
  LogOut,
  ChevronRight,
  ClipboardCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
  UserCog,
  Wrench,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getInitials } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  telaKey?: string
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
      { href: '/dashboard',  label: 'Dashboard', icon: LayoutDashboard },
      { href: '/clientes',   label: 'Clientes',  icon: Users,           telaKey: 'clientes' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/competencias', label: 'Competências',      icon: CalendarDays,    telaKey: 'competencias' },
      { href: '/tarefas',      label: 'Tarefas',           icon: CheckSquare,     telaKey: 'tarefas' },
      { href: '/fechamento',   label: 'Fechamento Mensal', icon: ClipboardCheck,  telaKey: 'fechamento' },
    ],
  },
  {
    label: 'Fiscal & Faturamento',
    perfis: ['admin', 'fiscal', 'financeiro'],
    items: [
      { href: '/fiscal', label: 'NFS-e',            icon: Receipt,  telaKey: 'fiscal' },
      { href: '/ir',     label: 'Imposto de Renda', icon: FileText, telaKey: 'ir' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/financeiro', label: 'Lançamentos', icon: Wallet, telaKey: 'financeiro' },
    ],
  },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin',          label: 'Administração',    icon: Settings, telaKey: 'admin' },
  { href: '/admin/usuarios', label: 'Usuários',         icon: UserCog,  telaKey: 'admin' },
  { href: '/admin/servicos', label: 'Tipos de Serviço', icon: Wrench,   telaKey: 'servicos' },
]

const COLLAPSED_KEY = 'sidebar-collapsed'

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    if (stored === 'true') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev))
      return !prev
    })
  }

  function canSeeItem(item: NavItem) {
    if (item.telaKey && usuario?.telas) return usuario.telas.includes(item.telaKey)
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

  const isAdmin = usuario?.perfil === 'admin'

  return (
    <aside
      className={cn(
        'flex flex-col min-h-screen shrink-0 transition-[width] duration-200 ease-in-out',
        'border-r border-sidebar-border',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
      style={{ background: 'oklch(0.11 0 0)' }}
    >
      {/* Logo row */}
      <div className={cn(
        'flex items-center h-14 border-b border-sidebar-border',
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
              <p className="text-sm font-bold text-white truncate">
                TTRD <span style={{ color: '#F5C200' }}>Contábil</span>
              </p>
            </Link>
            <Tooltip>
              <TooltipTrigger>
                <button
                  onClick={toggleCollapsed}
                  className="w-6 h-6 flex items-center justify-center rounded text-white/25 hover:text-white/60 hover:bg-white/8 transition-colors shrink-0"
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
                className="w-7 h-7 flex items-center justify-center rounded-md text-white/25 hover:text-white/60 hover:bg-white/8 transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
        {NAV_SECTIONS.filter(canSeeSection).map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest uppercase text-white/25 select-none">
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
                      'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer group',
                      collapsed && 'justify-center',
                      active
                        ? 'text-white bg-white/10'
                        : 'text-white/50 hover:text-white/85 hover:bg-white/6'
                    )}>
                      <Icon
                        size={15}
                        className={cn(
                          'shrink-0 transition-colors',
                          active ? 'text-[#F5C200]' : 'text-white/40 group-hover:text-white/60'
                        )}
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {active && <ChevronRight className="w-3 h-3 text-[#F5C200]/60 shrink-0" />}
                        </>
                      )}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest uppercase text-white/25 select-none">
                Administração
              </p>
            )}
            <div className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={cn(
                      'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer group',
                      collapsed && 'justify-center',
                      active
                        ? 'text-white bg-white/10'
                        : 'text-white/50 hover:text-white/85 hover:bg-white/6'
                    )}>
                      <Icon
                        size={15}
                        className={cn(
                          'shrink-0 transition-colors',
                          active ? 'text-[#F5C200]' : 'text-white/40 group-hover:text-white/60'
                        )}
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {active && <ChevronRight className="w-3 h-3 text-[#F5C200]/60 shrink-0" />}
                        </>
                      )}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
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
                className="w-7 h-7 flex items-center justify-center rounded-md text-white/30 hover:text-red-400 hover:bg-red-400/8 transition-colors"
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
              <p className="text-xs font-semibold text-white truncate leading-tight">{usuario?.nome ?? '—'}</p>
              <p className="text-[10px] text-white/40 capitalize truncate leading-tight">{usuario?.perfil ?? ''}</p>
            </div>
            <Tooltip>
              <TooltipTrigger>
                <button
                  onClick={logout}
                  className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-400/8 transition-colors shrink-0"
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
