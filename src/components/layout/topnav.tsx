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
  History,
  UserCog,
  Search,
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
    directHref: '/clientes',
    telaKey: 'clientes',
    items: [],
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: Layers,
    items: [
      { href: '/competencias', label: 'Competências',      description: 'Períodos por cliente',   icon: Layers,        telaKey: 'competencias' },
      { href: '/tarefas',      label: 'Tarefas',           description: 'Fila de trabalho',       icon: ClipboardList, telaKey: 'tarefas' },
      { href: '/fechamento',   label: 'Fechamento Mensal', description: 'Sign-off do mês',        icon: FolderOpen,    telaKey: 'fechamento' },
    ],
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    icon: Receipt,
    items: [
      { href: '/fiscal',           label: 'NFS-e',            description: 'Dashboard operacional', icon: Receipt,  telaKey: 'fiscal' },
      { href: '/fiscal/historico', label: 'Histórico NFS-e',  description: 'Notas já emitidas',     icon: History,  telaKey: 'fiscal' },
      { href: '/ir',               label: 'Imposto de Renda', description: 'Declarações anuais',    icon: FileText, telaKey: 'ir' },
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
    perfis: ['admin'],
    items: [
      { href: '/admin',           label: 'Painel Admin',     description: 'Visão geral do sistema',     icon: Settings, telaKey: 'admin',    perfis: ['admin'] },
      { href: '/admin/usuarios',  label: 'Usuários',         description: 'Contas e perfis de acesso',  icon: UserCog,  telaKey: 'admin',    perfis: ['admin'] },
      { href: '/admin/servicos',  label: 'Tipos de Serviço', description: 'Catálogo de serviços',       icon: Package2, telaKey: 'servicos', perfis: ['admin'] },
    ],
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
function NavDropdown({ items, isOpen }: { items: NavItem[]; isOpen: boolean }) {
  return (
    <div
      className={cn(
        'absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-56 rounded-xl overflow-hidden z-50',
        'bg-white border border-border shadow-md',
        'transition-all duration-150 origin-top',
        isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      )}
    >
      <div className="p-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors group"
            >
              <Icon size={14} className="text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
              <span className="font-medium">{item.label}</span>
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
          'flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold transition-all active:scale-95 bg-foreground text-background hover:bg-foreground/90',
          open && 'bg-foreground/90'
        )}
      >
        <Plus size={13} strokeWidth={2.5} />
        <span className="hidden sm:inline">Novo</span>
      </button>

      <div
        className={cn(
          'absolute top-full right-0 mt-1.5 w-52 rounded-xl overflow-hidden z-50',
          'bg-white border border-border shadow-md',
          'transition-all duration-150 origin-top-right',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        {contextual.length > 0 && (
          <div className="px-3 pt-2 pb-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Contextual</p>
          </div>
        )}
        <div className="p-1">
          {visible.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors group"
              >
                <Icon size={13} className="text-muted-foreground group-hover:text-foreground shrink-0" />
                <span className="font-medium">{a.label}</span>
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
          'flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-lg transition-colors hover:bg-muted',
          open && 'bg-muted'
        )}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 bg-primary text-primary-foreground">
          {usuario ? getInitials(usuario.nome) : '—'}
        </div>
        <ChevronDown size={11} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      <div
        className={cn(
          'absolute top-full right-0 mt-1.5 w-52 rounded-xl overflow-hidden z-50',
          'bg-white border border-border shadow-md',
          'transition-all duration-150 origin-top-right',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <div className="px-3 py-2.5 border-b border-border">
          <p className="text-sm font-semibold truncate">{usuario?.nome ?? '—'}</p>
          <p className="text-xs capitalize text-muted-foreground mt-0.5">{usuario?.perfil ?? ''}</p>
        </div>
        <div className="p-1">
          <button
            onClick={() => { setOpen(false); logout() }}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors group"
          >
            <LogOut size={13} className="text-muted-foreground group-hover:text-destructive shrink-0 transition-colors" />
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
          'absolute top-0 left-0 bottom-0 w-64 flex flex-col bg-white border-r border-border transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary">
              <Building2 size={12} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight">
              TTRD <span className="text-primary">Contábil</span>
            </span>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
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
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                    active ? 'bg-muted text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon size={14} />
                  {group.label}
                </Link>
              )
            }
            const visibleItems = group.items.filter(canSeeItem)
            if (visibleItems.length === 0) return null
            return (
              <div key={group.id}>
                <p className="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
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
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                        active ? 'bg-muted text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      <ItemIcon size={14} />
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
        className="sticky top-0 z-40 flex h-12 items-center gap-1 border-b border-border bg-white px-3 sm:px-4 lg:px-6"
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-2 shrink-0">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary">
            <Building2 size={13} className="text-primary-foreground" />
          </div>
          <span className="hidden sm:block text-sm font-bold tracking-tight text-foreground">
            TTRD <span className="text-primary">Contábil</span>
          </span>
        </Link>

        <div className="hidden md:block w-px h-4 mx-1 bg-border" />

        {/* Desktop nav items */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {NAV_GROUPS.filter(canSeeGroup).map((group) => {
            const Icon = group.icon
            const active = isGroupActive(group)
            const isOpen = openGroup === group.id

            if (group.directHref) {
              return (
                <Link
                  key={group.id}
                  href={group.directHref}
                  className={cn(
                    'flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm transition-colors',
                    active
                      ? 'font-semibold text-foreground bg-muted'
                      : 'font-medium text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon size={13} />
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
                    'flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm transition-colors',
                    active || isOpen
                      ? 'font-semibold text-foreground bg-muted'
                      : 'font-medium text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon size={13} />
                  {group.label}
                  <ChevronDown size={11} className={cn('transition-transform duration-150', isOpen && 'rotate-180')} />
                </button>
                <NavDropdown items={visibleItems} isOpen={isOpen} />
              </div>
            )
          })}
        </div>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Command palette trigger */}
          <button
            onClick={() => {
              const event = new CustomEvent('open-command-palette')
              window.dispatchEvent(event)
            }}
            className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Search size={13} />
            <span className="text-xs">Buscar</span>
            <kbd className="ml-1 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>
          <QuickActionsMenu usuario={usuario} />
          <UserMenu usuario={usuario} logout={logout} />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Menu size={16} />
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
