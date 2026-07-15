'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { appConfig } from '@/lib/app-config'
import { onBrand } from '@/lib/brand-theme'
import { canAccessTela, type TelaKey } from '@/lib/permissions'
import { getInitials } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import {
  BarChart3, Users, ClipboardList, Layers, FolderOpen,
  Receipt, FileText, Wallet, Settings, LogOut,
  ChevronDown, Menu, History, UserCog,
  Package2, CheckSquare, Plus, CalendarClock, Plug, SlidersHorizontal,
  AlertTriangle, LineChart,
} from 'lucide-react'
import { useHojeData } from '@/features/hoje/hooks'

// ── Types ─────────────────────────────────────────────────────
type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  telaKey?: TelaKey
  badge?: string
}
type NavSection = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  href?: string          // solo link (sem sub-itens)
  telaKey?: TelaKey
  items?: NavItem[]
}

type QuickAction = NavItem

// ── Navigation structure ───────────────────────────────────────
const NAV_SECTIONS: NavSection[] = [
  {
    id: 'hoje',
    label: 'Hoje',
    icon: CalendarClock,
    href: '/hoje',
    telaKey: 'hoje',
  },
  {
    id: 'painel',
    label: 'Painel',
    icon: BarChart3,
    href: '/dashboard',
    telaKey: 'dashboard',
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: Users,
    items: [
      { href: '/clientes', label: 'Clientes', icon: Users, telaKey: 'clientes' },
    ],
  },
  {
    id: 'operacional',
    label: 'Operacional',
    icon: ClipboardList,
    items: [
      { href: '/tarefas',      label: 'Tarefas',           icon: CheckSquare,   telaKey: 'tarefas' },
      { href: '/competencias', label: 'Competências',      icon: Layers,        telaKey: 'competencias' },
      { href: '/fechamento',   label: 'Fechamento Mensal', icon: FolderOpen,    telaKey: 'fechamento' },
    ],
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    icon: Receipt,
    items: [
      { href: '/fiscal',            label: 'Emitir NFS-e',     icon: Receipt,   telaKey: 'fiscal' },
      { href: '/fiscal/emitir-nfe', label: 'Emitir NF-e',      icon: Receipt,   telaKey: 'fiscal' },
      { href: '/fiscal/produtos',   label: 'Produtos (NF-e)',  icon: Package2,  telaKey: 'fiscal' },
      { href: '/fiscal/historico',  label: 'Histórico de Emissões', icon: History, telaKey: 'fiscal' },
      { href: '/ir',                label: 'Imposto de Renda', icon: FileText,  telaKey: 'ir' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    href: '/financeiro',
    telaKey: 'financeiro',
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: LineChart,
    items: [
      { href: '/relatorios/produtividade', label: 'Produtividade', icon: LineChart, telaKey: 'admin' },
    ],
  },
]

// Configurações/admin — renderizadas no rodapé, fora do fluxo operacional.
const ADMIN_SECTIONS: NavSection[] = [
  {
    id: 'admin',
    label: 'Configurações',
    icon: Settings,
    items: [
      { href: '/admin',            label: 'Painel Admin',     icon: Settings,          telaKey: 'admin' },
      { href: '/admin/usuarios',   label: 'Usuários',         icon: UserCog,           telaKey: 'admin' },
      { href: '/admin/servicos',   label: 'Tipos de Serviço', icon: Package2,          telaKey: 'servicos' },
      { href: '/admin/conectores', label: 'Conectores',       icon: Plug,              telaKey: 'admin' },
      { href: '/admin/parametros', label: 'Parâmetros',       icon: SlidersHorizontal, telaKey: 'admin' },
    ],
  },
]

const QUICK_ACTIONS: QuickAction[] = [
  { href: '/clientes/novo', label: 'Cliente', icon: Users, telaKey: 'clientes' },
  { href: '/tarefas/nova', label: 'Tarefa', icon: CheckSquare, telaKey: 'tarefas' },
  { href: '/financeiro/novo', label: 'Lançamento', icon: Wallet, telaKey: 'financeiro' },
  { href: '/fiscal?emitir=1', label: 'NFS-e', icon: Receipt, telaKey: 'fiscal' },
]

// ── Hoje summary widget ────────────────────────────────────────
function HojeSummary() {
  const { cockpit } = useHojeData()
  const data = cockpit.data
  if (!data) return null
  const atrasadas = data.atrasadas.length
  const hoje = data.hoje.length
  const total = atrasadas + hoje
  if (total === 0) return null

  return (
    <Link href="/hoje" className="mx-2 mb-1 block rounded-lg border border-border/70 bg-muted/35 px-3 py-2 transition-colors hover:bg-muted/60">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hoje</span>
        {atrasadas > 0 && <AlertTriangle size={11} className="text-destructive" />}
      </div>
      <div className="flex items-center gap-3">
        {atrasadas > 0 && (
          <div className="text-center">
            <p className="text-sm font-bold tabular-nums text-destructive">{atrasadas}</p>
            <p className="text-[9px] text-muted-foreground">atrasadas</p>
          </div>
        )}
        {hoje > 0 && (
          <div className="text-center">
            <p className="text-sm font-bold tabular-nums text-warning">{hoje}</p>
            <p className="text-[9px] text-muted-foreground">para hoje</p>
          </div>
        )}
      </div>
    </Link>
  )
}

// ── Sidebar content (shared between desktop + mobile Sheet) ───
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()

  function canSeeItem(item: NavItem) {
    if (item.telaKey) return canAccessTela(usuario, item.telaKey)
    return true
  }

  function canSeeSection(section: NavSection) {
    if (section.href && section.telaKey) return canAccessTela(usuario, section.telaKey)
    if (section.items) return section.items.some(canSeeItem)
    return true
  }

  const allNavHrefs = NAV_SECTIONS.flatMap(s => [
    ...(s.href ? [s.href] : []),
    ...(s.items?.map(i => i.href) ?? []),
  ])
  // Entre hrefs que casam com a rota atual (ex: '/fiscal' e '/fiscal/produtos'
  // casam ambos em '/fiscal/produtos'), só o mais específico (mais longo) fica ativo.
  const bestMatchHref = allNavHrefs
    .filter(href => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0]

  function isActive(href: string) {
    return href === bestMatchHref
  }

  function isSectionActive(section: NavSection) {
    if (section.href) return isActive(section.href)
    return section.items?.some(i => isActive(i.href)) ?? false
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    NAV_SECTIONS.forEach(s => {
      if (s.items) init[s.id] = s.items.some(i => pathname.startsWith(i.href))
    })
    return init
  })

  function toggleSection(id: string) {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const visibleSections = NAV_SECTIONS.filter(canSeeSection)
  const logoNode = appConfig.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appConfig.logoUrl} alt="" className="h-7 w-7 rounded-lg object-contain" />
  ) : (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: appConfig.brandPrimary, color: onBrand }}>
      <span style={{ fontFamily: 'inherit', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.06em', lineHeight: 1, fontSize: 12 }}>
        {appConfig.monogram}
      </span>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4 shrink-0">
        {logoNode}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight leading-none">
            {appConfig.name}
          </p>
          <p className="truncate text-[10px] text-muted-foreground mt-0.5">{appConfig.tagline}</p>
        </div>
      </div>

      {/* Hoje — indicadores contextuais */}
      <HojeSummary />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visibleSections.map((section) => {
          const Icon = section.icon
          const active = isSectionActive(section)

          /* Solo link */
          if (section.href) {
            return (
              <Link
                key={section.id}
                href={section.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon size={15} className="shrink-0" />
                {section.label}
              </Link>
            )
          }

          /* Collapsible group */
          const visibleItems = section.items?.filter(canSeeItem) ?? []
          if (visibleItems.length === 0) return null
          const isOpen = openSections[section.id] ?? false

          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronDown
                  size={13}
                  className={cn('shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
                />
              </button>

              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                  {visibleItems.map((item) => {
                    const ItemIcon = item.icon
                    const itemActive = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                          itemActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <ItemIcon size={13} className="shrink-0" />
                        {item.label}
                        {item.badge && (
                          <span className="ml-auto text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Configurações — rodapé, fora do fluxo operacional */}
      {ADMIN_SECTIONS.filter(canSeeSection).map((section) => {
        const visibleItems = section.items?.filter(canSeeItem) ?? []
        if (visibleItems.length === 0) return null
        const Icon = section.icon
        const active = isSectionActive(section)
        const isOpen = openSections[section.id] ?? false
        return (
          <div key={section.id} className="px-2 pb-1 shrink-0">
            <Separator className="mb-1" />
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon size={15} className="shrink-0" />
              <span className="flex-1 text-left">{section.label}</span>
              <ChevronDown size={13} className={cn('shrink-0 transition-transform duration-200', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                {visibleItems.map((item) => {
                  const ItemIcon = item.icon
                  const itemActive = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        itemActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <ItemIcon size={13} className="shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Quick actions */}
      <div className="px-2 pb-2 shrink-0">
        <Separator className="mb-2" />
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ações rápidas
          </span>
          <Plus size={11} className="text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_ACTIONS.filter(canSeeItem).map((action) => {
            const ActionIcon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                onClick={onNavigate}
                className="flex min-h-10 flex-col items-center justify-center gap-1 rounded-lg border border-border/70 bg-muted/35 px-2 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <ActionIcon size={13} />
                <span className="max-w-full truncate">{action.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* User footer */}
      <div className="border-t border-border px-3 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
            {usuario ? getInitials(usuario.nome) : '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{usuario?.nome ?? '—'}</p>
            <p className="truncate text-[10px] capitalize text-muted-foreground">{usuario?.perfil ?? ''}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Sair"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Desktop sidebar ────────────────────────────────────────────
export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0">
      <SidebarContent />
    </aside>
  )
}

// ── Mobile sidebar trigger (hamburger + Sheet) ─────────────────
export function MobileSidebarTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="Abrir menu">
        <Menu size={16} />
      </SheetTrigger>
      <SheetContent side="left" className="w-56 p-0">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
