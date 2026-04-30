'use client'

import { memo, useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela, type TelaKey } from '@/lib/permissions'
import { getInitials } from '@/lib/utils'
import type { UserSession } from '@/lib/auth-client'
import {
  Sun,
  BarChart3,
  Users,
  Package2,
  Layers,
  ClipboardList,
  FolderOpen,
  Receipt,
  FileText,
  Wallet,
  Settings,
  LogOut,
  Plus,
  ChevronDown,
  Building2,
  Menu,
  X,
  CheckSquare,
  DollarSign,
  ChevronRight,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────
type NavItem = {
  href: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  telaKey?: TelaKey
  perfis?: string[]
}

type NavGroup = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  directHref?: string
  telaKey?: TelaKey
  perfis?: string[]
  items: NavItem[]
}

// ── Navigation structure ──────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'hoje',
    label: 'Hoje',
    icon: Sun,
    directHref: '/hoje',
    telaKey: 'hoje',
    items: [],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    directHref: '/dashboard',
    telaKey: 'dashboard',
    items: [],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: Users,
    items: [
      { href: '/clientes',       label: 'Lista de Clientes',  description: 'Gerencie sua carteira',    icon: Users,    telaKey: 'clientes' },
      { href: '/admin/servicos', label: 'Tipos de Serviço',   description: 'Catálogo de serviços',     icon: Package2, telaKey: 'servicos' },
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: Layers,
    items: [
      { href: '/competencias', label: 'Competências',      description: 'Períodos por cliente',   icon: Layers,       telaKey: 'competencias' },
      { href: '/tarefas',      label: 'Tarefas',           description: 'Fila de trabalho',       icon: ClipboardList, telaKey: 'tarefas' },
      { href: '/fechamento',   label: 'Fechamento Mensal', description: 'Sign-off do mês',        icon: FolderOpen,   telaKey: 'fechamento' },
    ],
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    icon: Receipt,
    items: [
      { href: '/fiscal', label: 'NFS-e',             description: 'Emissão de notas',    icon: Receipt,  telaKey: 'fiscal' },
      { href: '/ir',     label: 'Imposto de Renda',  description: 'Declarações anuais',  icon: FileText, telaKey: 'ir' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    directHref: '/financeiro',
    telaKey: 'financeiro',
    perfis: ['admin', 'financeiro'],
    items: [],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    directHref: '/admin',
    telaKey: 'admin',
    perfis: ['admin'],
    items: [],
  },
]

const QUICK_ACTIONS: NavItem[] = [
  { href: '/clientes/novo',     label: 'Novo Cliente',        icon: Users,        telaKey: 'clientes' },
  { href: '/tarefas/nova',      label: 'Nova Tarefa',         icon: CheckSquare,  telaKey: 'tarefas' },
  { href: '/competencias/nova', label: 'Nova Competência',    icon: Layers,       telaKey: 'competencias' },
  { href: '/financeiro/novo',   label: 'Novo Lançamento',     icon: DollarSign,   telaKey: 'financeiro', perfis: ['admin', 'financeiro'] },
  { href: '/fiscal/emitir',     label: 'Emitir NFS-e',        icon: Receipt,      telaKey: 'fiscal',     perfis: ['admin', 'fiscal', 'financeiro'] },
]

// ── Dropdown menu ─────────────────────────────────────────────────────
function NavDropdown({
  items,
  isOpen,
}: {
  items: NavItem[]
  isOpen: boolean
}) {
  return (
    <div
      className={cn(
        'absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-64 rounded-2xl overflow-hidden z-50',
        'transition-all duration-150 origin-top',
        isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      )}
      style={{
        background: 'oklch(0.17 0.014 260)',
        border: '1px solid oklch(1 0 0 / 0.1)',
        boxShadow: '0 20px 60px -12px rgba(0,0,0,0.55), 0 4px 16px -4px rgba(0,0,0,0.35)',
      }}
    >
      <div className="p-1.5">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-colors hover:bg-white/8"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors group-hover:bg-white/10"
                style={{ background: 'oklch(1 0 0 / 0.06)' }}
              >
                <Icon size={14} className="text-white/60 group-hover:text-white/90 transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/85 group-hover:text-white transition-colors leading-tight">
                  {item.label}
                </p>
                {item.description && (
                  <p className="text-xs text-white/40 group-hover:text-white/60 transition-colors leading-tight mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              <ChevronRight size={12} className="ml-auto text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Quick Actions button ──────────────────────────────────────────────
function QuickActionsMenu({ usuario }: { usuario: UserSession | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function canSeeAction(a: NavItem) {
    if (a.perfis && (!usuario || !a.perfis.includes(usuario.perfil))) return false
    if (a.telaKey) return canAccessTela(usuario, a.telaKey)
    return true
  }

  // Add contextual actions
  const pathParts = pathname.split('/').filter(Boolean)
  const clienteId = pathParts[0] === 'clientes' && pathParts[1] && pathParts[1] !== 'novo' ? pathParts[1] : null
  const contextual: NavItem[] = []
  if (clienteId) {
    contextual.push({ href: `/tarefas/nova?clienteId=${clienteId}`, label: 'Tarefa para este cliente', icon: CheckSquare })
    contextual.push({ href: `/financeiro/novo?clienteId=${clienteId}`, label: 'Lançamento para este cliente', icon: DollarSign })
  }

  const visible = [
    ...contextual,
    ...QUICK_ACTIONS.filter(canSeeAction),
  ].filter((a, i, arr) => arr.findIndex((x) => x.href === a.href) === i)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold transition-all active:scale-95',
          'hover:brightness-105',
          open && 'brightness-105'
        )}
        style={{ background: '#F5C200', color: '#0a0a0a' }}
      >
        <Plus size={14} strokeWidth={2.5} />
        <span className="hidden sm:inline">Novo</span>
      </button>

      <div
        className={cn(
          'absolute top-full right-0 mt-1.5 w-60 rounded-2xl overflow-hidden z-50',
          'transition-all duration-150 origin-top-right',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        )}
        style={{
          background: 'oklch(0.17 0.014 260)',
          border: '1px solid oklch(1 0 0 / 0.1)',
          boxShadow: '0 20px 60px -12px rgba(0,0,0,0.55)',
        }}
      >
        {contextual.length > 0 && (
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Contextual</p>
          </div>
        )}
        <div className="p-1.5">
          {visible.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-colors hover:bg-white/8"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'oklch(1 0 0 / 0.06)' }}>
                  <Icon size={13} className="text-white/60 group-hover:text-white/90 transition-colors" />
                </div>
                <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                  {a.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── User menu ─────────────────────────────────────────────────────────
function UserMenu({ usuario, logout }: { usuario: UserSession | null; logout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-xl transition-colors',
          'hover:bg-white/8',
          open && 'bg-white/8'
        )}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: '#F5C200', color: '#0a0a0a' }}
        >
          {usuario ? getInitials(usuario.nome) : '—'}
        </div>
        <div className="hidden lg:block text-left min-w-0">
          <p className="text-xs font-semibold text-white/85 leading-tight truncate max-w-[100px]">
            {usuario?.nome ?? '—'}
          </p>
          <p className="text-[10px] capitalize text-white/40 leading-tight">
            {usuario?.perfil ?? ''}
          </p>
        </div>
        <ChevronDown size={12} className={cn('text-white/40 transition-transform', open && 'rotate-180')} />
      </button>

      <div
        className={cn(
          'absolute top-full right-0 mt-1.5 w-56 rounded-2xl overflow-hidden z-50',
          'transition-all duration-150 origin-top-right',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        )}
        style={{
          background: 'oklch(0.17 0.014 260)',
          border: '1px solid oklch(1 0 0 / 0.1)',
          boxShadow: '0 20px 60px -12px rgba(0,0,0,0.55)',
        }}
      >
        <div className="px-4 py-3 border-b border-white/8">
          <p className="text-sm font-semibold text-white/90 truncate">{usuario?.nome ?? '—'}</p>
          <p className="text-xs capitalize text-white/40 mt-0.5">{usuario?.perfil ?? ''}</p>
        </div>
        <div className="p-1.5">
          <button
            onClick={() => { setOpen(false); logout() }}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/8 transition-colors group"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-destructive/20 transition-colors" style={{ background: 'oklch(1 0 0 / 0.06)' }}>
              <LogOut size={13} className="text-white/60 group-hover:text-destructive transition-colors" />
            </div>
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mobile nav ────────────────────────────────────────────────────────
function MobileNav({
  open,
  onClose,
  groups,
  canSeeGroup,
  canSeeItem,
  isActive,
}: {
  open: boolean
  onClose: () => void
  groups: NavGroup[]
  canSeeGroup: (g: NavGroup) => boolean
  canSeeItem: (i: NavItem) => boolean
  isActive: (href: string) => boolean
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 transition-all duration-200',
        open ? 'pointer-events-auto' : 'pointer-events-none'
      )}
    >
      {/* Backdrop */}
      <div
        className={cn('absolute inset-0 bg-black/60 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={cn(
          'absolute top-0 left-0 bottom-0 w-72 flex flex-col transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'oklch(0.13 0.012 260)' }}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#F5C200' }}>
              <Building2 size={14} style={{ color: '#0a0a0a' }} />
            </div>
            <span className="text-sm font-bold text-white">
              TTRD <span style={{ color: '#F5C200' }}>Contábil</span>
            </span>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {groups.filter(canSeeGroup).map((group) => {
            if (group.directHref) {
              const active = isActive(group.directHref)
              const Icon = group.icon
              return (
                <Link
                  key={group.id}
                  href={group.directHref}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/6'
                  )}
                  style={active ? { background: 'oklch(0.82 0.18 88 / 0.15)', color: '#F5C200' } : {}}
                >
                  <Icon size={15} />
                  {group.label}
                </Link>
              )
            }
            const Icon = group.icon
            const visibleItems = group.items.filter(canSeeItem)
            if (visibleItems.length === 0) return null
            return (
              <div key={group.id}>
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                  {group.label}
                </p>
                {visibleItems.map((item) => {
                  const active = isActive(item.href)
                  const ItemIcon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                        active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/6'
                      )}
                      style={active ? { background: 'oklch(0.82 0.18 88 / 0.15)', color: '#F5C200' } : {}}
                    >
                      <ItemIcon size={15} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

// ── Main Topnav ───────────────────────────────────────────────────────
export const Topnav = memo(function Topnav() {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (navRef.current && !navRef.current.contains(e.target as Node)) {
      setOpenGroup(null)
    }
  }, [])

  useEffect(() => {
    if (openGroup) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [openGroup, handleOutsideClick])

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  function canSeeItem(item: NavItem) {
    if (item.perfis && (!usuario || !item.perfis.includes(usuario.perfil))) return false
    if (item.telaKey) return canAccessTela(usuario, item.telaKey)
    return true
  }

  function canSeeGroup(group: NavGroup) {
    if (group.perfis && (!usuario || !group.perfis.includes(usuario.perfil))) return false
    if (group.directHref && group.telaKey) return canAccessTela(usuario, group.telaKey)
    return group.items.some(canSeeItem)
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  function isGroupActive(group: NavGroup) {
    if (group.directHref) return isActive(group.directHref)
    return group.items.some((item) => isActive(item.href))
  }

  return (
    <>
      <nav
        ref={navRef}
        className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b px-3 sm:px-4 lg:px-6"
        style={{
          background: 'oklch(0.13 0.012 260)',
          borderBottomColor: 'oklch(1 0 0 / 0.08)',
        }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-3 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#F5C200' }}
          >
            <Building2 size={14} style={{ color: '#0a0a0a' }} />
          </div>
          <span className="hidden sm:block text-sm font-bold" style={{ color: 'white' }}>
            TTRD <span style={{ color: '#F5C200' }}>Contábil</span>
          </span>
        </Link>

        {/* Separator */}
        <div className="hidden md:block w-px h-5 mx-1" style={{ background: 'oklch(1 0 0 / 0.1)' }} />

        {/* Desktop nav items */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {NAV_GROUPS.filter(canSeeGroup).map((group) => {
            const Icon = group.icon
            const active = isGroupActive(group)
            const isOpen = openGroup === group.id
            const hasDropdown = group.items.length > 0

            if (group.directHref) {
              return (
                <Link
                  key={group.id}
                  href={group.directHref}
                  className={cn(
                    'flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'text-white/95'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/6'
                  )}
                  style={active ? { color: '#F5C200' } : {}}
                >
                  <Icon size={14} />
                  {group.label}
                </Link>
              )
            }

            const visibleItems = group.items.filter(canSeeItem)
            if (visibleItems.length === 0) return null

            return (
              <div key={group.id} className="relative">
                <button
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  className={cn(
                    'flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                    active || isOpen
                      ? 'text-white/95'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/6'
                  )}
                  style={active ? { color: '#F5C200' } : {}}
                >
                  <Icon size={14} />
                  {group.label}
                  <ChevronDown
                    size={12}
                    className={cn('transition-transform duration-150 opacity-60', isOpen && 'rotate-180')}
                  />
                </button>
                <NavDropdown items={visibleItems} isOpen={isOpen} />
              </div>
            )
          })}
        </div>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          <QuickActionsMenu usuario={usuario} />
          <UserMenu usuario={usuario} logout={logout} />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Menu size={18} />
          </button>
        </div>
      </nav>

      {/* Mobile nav drawer */}
      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        groups={NAV_GROUPS}
        canSeeGroup={canSeeGroup}
        canSeeItem={canSeeItem}
        isActive={isActive}
      />
    </>
  )
})
