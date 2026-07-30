'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { appConfig } from '@/lib/app-config'
import { onBrand } from '@/lib/brand-theme'
import { canAccessTela, type TelaKey } from '@/lib/permissions'
import { getInitials } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  BarChart3, Users, ClipboardList, Layers, FolderOpen,
  Receipt, FileText, Wallet, Settings, LogOut,
  ChevronDown, Menu, History, UserCog,
  Package2, CheckSquare, CalendarClock, Plug, SlidersHorizontal,
  LineChart,
} from 'lucide-react'
import { useHojeData } from '@/features/hoje/hooks'

// ── Types ─────────────────────────────────────────────────────
// `badgeKey` liga o item a um contador vivo (ver useNavCounts). A navegação
// deixa de ser só um índice de telas e passa a dizer ONDE está o trabalho —
// sem isso o contador precisa abrir tela por tela pra descobrir o que o espera.
type BadgeKey = 'atrasadas' | 'hoje'
type BadgeTone = 'urgente' | 'atencao' | 'neutro'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  telaKey?: TelaKey
  badgeKey?: BadgeKey
}
type NavSection = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  href?: string          // solo link (sem sub-itens)
  telaKey?: TelaKey
  badgeKey?: BadgeKey
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
    badgeKey: 'atrasadas',
  },
  {
    id: 'painel',
    label: 'Painel',
    icon: BarChart3,
    href: '/dashboard',
    telaKey: 'dashboard',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: Users,
    href: '/clientes',
    telaKey: 'clientes',
  },
  {
    id: 'operacional',
    label: 'Operacional',
    icon: ClipboardList,
    items: [
      { href: '/tarefas',      label: 'Tarefas',           icon: CheckSquare, telaKey: 'tarefas', badgeKey: 'hoje' },
      { href: '/competencias', label: 'Competências',      icon: Layers,      telaKey: 'competencias' },
      { href: '/fechamento',   label: 'Fechamento Mensal', icon: FolderOpen,  telaKey: 'fechamento' },
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
      { href: '/fiscal/historico',  label: 'Histórico',        icon: History,   telaKey: 'fiscal' },
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

// ── Persistência dos grupos abertos ────────────────────────────
// Grupos nascem ABERTOS (menos Configurações) e a escolha sobrevive à
// navegação. Antes eles nasciam fechados e só abriam se a rota casasse — o que
// custava dois cliques pra chegar em quase tudo e voltava a fechar sozinho.
// Era a maior parte da sensação de "navegação lerda": não era render, era
// profundidade de menu.
//
// localStorage é uma store EXTERNA ao React, então lemos via
// useSyncExternalStore: sem setState dentro de efeito, e sem descasar a
// hidratação (no servidor o snapshot é sempre o default).
const STORAGE_KEY = 'sidebar:openSections'

const DEFAULT_OPEN: Record<string, boolean> = Object.fromEntries(
  [...NAV_SECTIONS, ...ADMIN_SECTIONS]
    .filter((s) => s.items)
    .map((s) => [s.id, s.id !== 'admin']),
)

const ouvintes = new Set<() => void>()
let cacheValor: Record<string, boolean> = DEFAULT_OPEN
let cacheRaw: string | null | undefined

function lerAberturas(): Record<string, boolean> {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    raw = null // modo privado / storage bloqueado
  }
  // getSnapshot precisa devolver a MESMA referência enquanto nada mudar,
  // senão o React entra em loop de re-render.
  if (raw === cacheRaw) return cacheValor
  cacheRaw = raw
  let parsed: Record<string, boolean> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, boolean>
    } catch {
      parsed = {} // json corrompido: volta ao default
    }
  }
  cacheValor = { ...DEFAULT_OPEN, ...parsed }
  return cacheValor
}

function lerAberturasServidor(): Record<string, boolean> {
  return DEFAULT_OPEN
}

function assinarAberturas(cb: () => void) {
  ouvintes.add(cb)
  return () => { ouvintes.delete(cb) }
}

function gravarAberturas(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // sem persistência: o estado ainda vale para esta sessão
  }
  cacheRaw = undefined // força releitura no próximo snapshot
  ouvintes.forEach((l) => l())
}

// ── Contadores vivos da navegação ──────────────────────────────
// Hoje só o cockpit alimenta badges. Os contadores de fiscal e financeiro
// ficam de fora de propósito: as queries que os produziriam hoje devolvem
// número errado (agregado calculado sobre a página atual, e status que nunca
// é gravado) — badge com número mentiroso é pior que badge nenhum.
function useNavCounts(): Record<BadgeKey, number> {
  const { cockpit } = useHojeData()
  const data = cockpit.data
  return {
    atrasadas: data?.atrasadas.length ?? 0,
    hoje: data?.hoje.length ?? 0,
  }
}

function toneFor(key: BadgeKey): BadgeTone {
  if (key === 'atrasadas') return 'urgente'
  if (key === 'hoje') return 'atencao'
  return 'neutro'
}

function NavBadge({ count, tone }: { count: number; tone: BadgeTone }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5',
        'text-[11px] font-semibold tabular-nums leading-none',
        tone === 'urgente' && 'bg-destructive text-white',
        tone === 'atencao' && 'bg-warning/15 text-warning',
        tone === 'neutro'  && 'bg-muted text-muted-foreground',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ── Sidebar content (shared between desktop + mobile Sheet) ───
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { usuario, logout } = useAuth()
  const counts = useNavCounts()

  function canSeeItem(item: NavItem) {
    if (item.telaKey) return canAccessTela(usuario, item.telaKey)
    return true
  }

  function canSeeSection(section: NavSection) {
    if (section.href && section.telaKey) return canAccessTela(usuario, section.telaKey)
    if (section.items) return section.items.some(canSeeItem)
    return true
  }

  const allNavHrefs = [...NAV_SECTIONS, ...ADMIN_SECTIONS].flatMap(s => [
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

  const openSections = useSyncExternalStore(assinarAberturas, lerAberturas, lerAberturasServidor)

  function toggleSection(id: string) {
    gravarAberturas({ ...openSections, [id]: !openSections[id] })
  }

  const visibleSections = NAV_SECTIONS.filter(canSeeSection)

  /* Linha de navegação — a mesma geometria para link solo, cabeçalho de grupo
     e sub-item, para o olho ler uma coluna só em vez de três ritmos diferentes. */
  const rowBase =
    'group relative flex w-full items-center gap-3 rounded-lg pl-3 pr-2.5 text-sm ' +
    'min-h-10 transition-colors duration-150 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card'
  const rowIdle = 'text-muted-foreground hover:bg-muted hover:text-foreground'
  const rowActive = 'bg-primary/10 text-primary font-semibold'

  /* Barra de 3px na borda esquerda do item ativo. Dá um plano a mais de
     profundidade que o preenchimento sozinho não dá, e marca a posição na
     lista mesmo quando o rótulo está fora do canto do olho. */
  const activeRail =
    'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] ' +
    'before:-translate-y-1/2 before:rounded-r-full before:bg-primary'

  function renderSection(section: NavSection) {
    const Icon = section.icon
    const active = isSectionActive(section)

    /* Solo link */
    if (section.href) {
      return (
        <Link
          key={section.id}
          href={section.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(rowBase, active ? cn(rowActive, activeRail) : rowIdle)}
        >
          <Icon size={18} className="shrink-0" />
          <span className="truncate">{section.label}</span>
          {section.badgeKey && <NavBadge count={counts[section.badgeKey]} tone={toneFor(section.badgeKey)} />}
        </Link>
      )
    }

    /* Grupo colapsável */
    const visibleItems = section.items?.filter(canSeeItem) ?? []
    if (visibleItems.length === 0) return null
    const isOpen = openSections[section.id] ?? true

    // A soma dos filhos sobe para o cabeçalho quando o grupo está fechado —
    // fechar um grupo não pode esconder que existe trabalho lá dentro.
    const somaFilhos = visibleItems.reduce(
      (acc, i) => acc + (i.badgeKey ? counts[i.badgeKey] : 0), 0,
    )

    return (
      <div key={section.id}>
        <button
          type="button"
          onClick={() => toggleSection(section.id)}
          aria-expanded={isOpen}
          className={cn(
            rowBase,
            'font-medium',
            active && !isOpen ? cn(rowActive, activeRail) : rowIdle,
          )}
        >
          <Icon size={18} className="shrink-0" />
          <span className="flex-1 truncate text-left">{section.label}</span>
          {!isOpen && somaFilhos > 0 && <NavBadge count={somaFilhos} tone="neutro" />}
          <ChevronDown
            size={15}
            className={cn(
              'shrink-0 text-muted-foreground/70 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        {isOpen && (
          <div className="relative mt-0.5 space-y-0.5 pl-[26px]">
            {/* Guia vertical alinhada ao centro dos ícones do nível acima */}
            <span aria-hidden className="absolute left-[21px] top-1 bottom-1 w-px bg-border" />
            {visibleItems.map((item) => {
              const ItemIcon = item.icon
              const itemActive = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={itemActive ? 'page' : undefined}
                  className={cn(rowBase, 'gap-2.5', itemActive ? rowActive : rowIdle)}
                >
                  <ItemIcon size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badgeKey && <NavBadge count={counts[item.badgeKey]} tone={toneFor(item.badgeKey)} />}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Marca */}
      {appConfig.logoUrl ? (
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appConfig.logoUrl} alt={appConfig.name} className="hidden h-10 w-auto object-contain dark:block" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appConfig.logoUrlLight ?? appConfig.logoUrl} alt={appConfig.name} className="block h-10 w-auto object-contain dark:hidden" />
        </div>
      ) : (
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
            style={{ background: appConfig.brandPrimary, color: onBrand }}
          >
            <span style={{ fontFamily: 'inherit', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.06em', lineHeight: 1, fontSize: 14 }}>
              {appConfig.monogram}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight tracking-tight">{appConfig.name}</p>
            <p className="truncate text-xs text-muted-foreground">{appConfig.tagline}</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleSections.map((s) => renderSection(s))}
      </nav>

      {/* Ações rápidas — uma linha de ícones em vez do grid 2×2, que comia
          quase 100px de altura para repetir destinos que já estão na nav. */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Criar
        </p>
        <div className="flex items-center gap-1.5">
          {QUICK_ACTIONS.filter(canSeeItem).map((action) => {
            const ActionIcon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                onClick={onNavigate}
                title={action.label}
                aria-label={`Criar ${action.label}`}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center rounded-lg border border-border/70 bg-muted/40',
                  'text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                )}
              >
                <ActionIcon size={16} />
              </Link>
            )
          })}
        </div>
      </div>

      {/* Configurações + usuário */}
      <div className="shrink-0 border-t border-border px-3 py-3 space-y-1">
        {ADMIN_SECTIONS.filter(canSeeSection).map((s) => renderSection(s))}

        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
            {usuario ? getInitials(usuario.nome) : '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{usuario?.nome ?? '—'}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{usuario?.perfil ?? ''}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sair"
            title="Sair"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors',
              'hover:bg-destructive/10 hover:text-destructive',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40',
            )}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Desktop sidebar ────────────────────────────────────────────
export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-[272px] shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0">
      <SidebarContent />
    </aside>
  )
}

// ── Mobile sidebar trigger (hamburger + Sheet) ─────────────────
export function MobileSidebarTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="flex md:hidden h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
