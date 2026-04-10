'use client'

import { memo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import {
  LayoutDashboard,
  Receipt,
  ChevronDown,
  Bell,
  LogOut,
  Building2,
  Users,
  Briefcase,
  CalendarDays,
  CheckSquare,
  FileText,
  DollarSign,
  ClipboardCheck,
  Settings,
  Menu,
  X,
  Plus,
  UserCog,
  Wrench,
  BarChart3,
  Wallet,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'

/* ─── Nav data ────────────────────────────────────────────── */
type NavItem   = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; telaKey?: string }
type NavGroup  = { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; items: NavItem[]; perfis?: string[] }
type NavDirect = NavItem & { perfis?: string[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Carteira',
    icon: Users,
    items: [
      { href: '/clientes',       label: 'Clientes',         icon: Users,     telaKey: 'clientes' },
      { href: '/admin/servicos', label: 'Tipos de Serviço', icon: Briefcase, telaKey: 'servicos' },
    ],
  },
  {
    label: 'Operação',
    icon: ClipboardCheck,
    items: [
      { href: '/competencias', label: 'Competências',      icon: CalendarDays,  telaKey: 'competencias' },
      { href: '/tarefas',      label: 'Tarefas',           icon: CheckSquare,   telaKey: 'tarefas' },
      { href: '/fechamento',   label: 'Fechamento Mensal', icon: ClipboardCheck, telaKey: 'fechamento' },
    ],
  },
  {
    label: 'Fiscal',
    icon: Receipt,
    perfis: ['admin', 'fiscal', 'financeiro'],
    items: [
      { href: '/fiscal', label: 'Painel NFS-e',     icon: Receipt,  telaKey: 'fiscal' },
      { href: '/ir',     label: 'Imposto de Renda', icon: FileText, telaKey: 'ir' },
    ],
  },
]

const NAV_DIRECT: NavDirect[] = [
  { href: '/financeiro', label: 'Financeiro',    icon: Wallet,   telaKey: 'financeiro' },
  { href: '/admin',      label: 'Administração', icon: Settings, telaKey: 'admin', perfis: ['admin'] },
]

/* ─── CTA per section ─────────────────────────────────────── */
const CTA_MAP: Record<string, { label: string; href: string }> = {
  '/clientes':      { label: 'Novo Cliente',      href: '/clientes/novo' },
  '/competencias':  { label: 'Nova Competência',  href: '/competencias/nova' },
  '/tarefas':       { label: 'Nova Tarefa',        href: '/tarefas/nova' },
  '/financeiro':    { label: 'Novo Lançamento',   href: '/financeiro/novo' },
  '/ir':            { label: 'Nova Declaração',   href: '/ir/nova' },
  '/fiscal':        { label: 'Emitir NFS-e',      href: '/fiscal/emitir' },
}

function useCTA(pathname: string) {
  const base = '/' + pathname.split('/').filter(Boolean)[0]
  return CTA_MAP[base] ?? null
}

/* ─── Component ───────────────────────────────────────────── */
export const Navbar = memo(function Navbar() {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()
  const [openDropdown, setOpenDropdown]  = useState<string | null>(null)
  const [mobileOpen, setMobileOpen]      = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cta = useCTA(pathname)

  useEffect(() => {
    setOpenDropdown(null)
    setMobileOpen(false)
  }, [pathname])

  // Cleanup timer on unmount
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  function openMenu(key: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenDropdown(key)
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpenDropdown(null), 120)
  }

  function canSee(perfis?: string[], telaKey?: string) {
    // If user has granular telas defined, use those
    if (telaKey && usuario?.telas) {
      return usuario.telas.includes(telaKey)
    }
    // Fall back to profile-level access
    if (!perfis) return true
    return !!usuario && perfis.includes(usuario.perfil)
  }

  function canSeeGroup(group: NavGroup) {
    // Group is visible if at least one item is accessible
    if (group.items.some((item) => canSee(undefined, item.telaKey))) return true
    // Also check group-level perfis as fallback
    return canSee(group.perfis)
  }

  function isGroupActive(items: NavItem[]) {
    return items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      <nav className="sticky top-0 z-50 w-full" style={{ background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-6">

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: '#F5C200' }}>
                <Building2 className="w-4 h-4" style={{ color: '#0a0a0a' }} />
              </div>
              <span className="font-bold text-sm tracking-tight text-white hidden sm:block">
                TTRD <span style={{ color: '#F5C200' }}>Contábil</span>
              </span>
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-0.5 flex-1">

              {/* Dashboard */}
              <Link
                href="/dashboard"
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-semibold tracking-tight transition-colors',
                  isActive('/dashboard')
                    ? 'text-white'
                    : 'text-white/55 hover:text-white/85 hover:bg-white/5'
                )}
              >
                <LayoutDashboard size={15} />
                Início
                {isActive('/dashboard') && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: '#F5C200' }} />
                )}
              </Link>

              {/* Dropdown groups */}
              {NAV_GROUPS.filter(g => canSeeGroup(g)).map((group) => {
                const active = isGroupActive(group.items)
                const isOpen = openDropdown === group.label
                const GroupIcon = group.icon
                return (
                  <div
                    key={group.label}
                    className="relative"
                    onMouseEnter={() => openMenu(group.label)}
                    onMouseLeave={scheduleClose}
                  >
                    <button
                      className={cn(
                        'relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold tracking-tight rounded-md transition-colors cursor-pointer',
                        active
                          ? 'text-white'
                          : 'text-white/55 hover:text-white/85 hover:bg-white/5'
                      )}
                    >
                      <GroupIcon size={15} />
                      {group.label}
                      <ChevronDown
                        size={13}
                        className={cn('transition-transform duration-150 ml-0.5', isOpen && 'rotate-180')}
                      />
                      {active && (
                        <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: '#F5C200' }} />
                      )}
                    </button>

                    {isOpen && (
                      <div className="absolute top-full left-0 w-56 pt-2 z-50">
                        <div
                          className="rounded-xl py-1.5 overflow-hidden"
                          style={{
                            background: '#161616',
                            border: '1px solid rgba(255,255,255,0.10)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                          }}
                        >
                          {group.items.filter(item => canSee(undefined, item.telaKey)).map((item) => {
                            const isItemActive = isActive(item.href)
                            const Icon = item.icon
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                  'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                                  isItemActive
                                    ? 'text-white bg-white/8'
                                    : 'text-white/60 hover:text-white hover:bg-white/6'
                                )}
                              >
                                <div className={cn(
                                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                                  isItemActive ? 'bg-[#F5C200]/15' : 'bg-white/6'
                                )}>
                                  <Icon size={14} className={isItemActive ? 'text-[#F5C200]' : 'text-white/45'} />
                                </div>
                                <span>{item.label}</span>
                                {isItemActive && (
                                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#F5C200] shrink-0" />
                                )}
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Direct links */}
              {NAV_DIRECT.filter(item => canSee(item.perfis, item.telaKey)).map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-semibold tracking-tight transition-colors',
                      active
                        ? 'text-white'
                        : 'text-white/55 hover:text-white/85 hover:bg-white/5'
                    )}
                  >
                    <Icon size={15} />
                    {item.label}
                    {active && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: '#F5C200' }} />
                    )}
                  </Link>
                )
              })}
            </div>

            {/* Right: CTA + Bell + User */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Contextual CTA */}
              {cta && (
                <Link
                  href={cta.href}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: '#F5C200', color: '#0a0a0a' }}
                >
                  <Plus size={15} strokeWidth={2.5} />
                  {cta.label}
                </Link>
              )}

              {/* Bell */}
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors hidden sm:flex"
              >
                <Bell size={16} />
              </button>

              {/* User */}
              <div
                className="relative"
                onMouseEnter={() => openMenu('user')}
                onMouseLeave={scheduleClose}
              >
                <button className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition-colors cursor-pointer">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: '#F5C200', color: '#0a0a0a' }}
                  >
                    {usuario ? getInitials(usuario.nome) : '—'}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-xs font-semibold text-white leading-tight">{usuario?.nome?.split(' ')[0] ?? ''}</p>
                    <p className="text-[10px] text-white/45 capitalize leading-tight">{usuario?.perfil ?? ''}</p>
                  </div>
                  <ChevronDown size={12} className="text-white/35 hidden lg:block" />
                </button>

                {openDropdown === 'user' && (
                  <div className="absolute top-full right-0 w-56 pt-2 z-50">
                  <div
                    className="rounded-xl py-1.5 overflow-hidden"
                    style={{
                      background: '#161616',
                      border: '1px solid rgba(255,255,255,0.10)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <p className="text-xs font-semibold text-white">{usuario?.nome}</p>
                      <p className="text-[11px] text-white/45 capitalize mt-0.5">{usuario?.perfil}</p>
                    </div>
                    <button
                      onClick={logout}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors cursor-pointer"
                      style={{ color: '#ff6b6b' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,107,107,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <LogOut size={14} />
                      Sair da conta
                    </button>
                  </div>
                  </div>
                )}
              </div>

              {/* Mobile toggle */}
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/8 transition-colors md:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t px-4 py-3 space-y-0.5" style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#0a0a0a' }}>
            <Link href="/dashboard" className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium', isActive('/dashboard') ? 'text-white bg-white/8' : 'text-white/55')}>
              <LayoutDashboard size={15} /> Início
            </Link>
            {NAV_GROUPS.filter(g => canSeeGroup(g)).flatMap(group =>
              group.items.filter(item => canSee(undefined, item.telaKey)).map(item => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link key={item.href} href={item.href} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm', active ? 'text-white bg-white/8 font-medium' : 'text-white/55')}>
                    <Icon size={15} /> {item.label}
                  </Link>
                )
              })
            )}
            {NAV_DIRECT.filter(i => canSee(i.perfis, i.telaKey)).map(item => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm', active ? 'text-white bg-white/8 font-medium' : 'text-white/55')}>
                  <Icon size={15} /> {item.label}
                </Link>
              )
            })}
            <div className="pt-2 mt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <button onClick={logout} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 w-full rounded-lg cursor-pointer">
                <LogOut size={15} /> Sair
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  )
})
