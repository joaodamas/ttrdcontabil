'use client'

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { where, orderBy, limit } from 'firebase/firestore'
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
  Plus, CheckSquare, DollarSign, Clock3, Star, Package2,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela, type TelaKey } from '@/lib/permissions'
import {
  getFavoriteNavigation,
  getRecentNavigation,
  isFavoriteNavigation,
  rememberNavigation,
  toggleFavoriteNavigation,
} from '@/lib/recent-navigation'
import { listDocuments } from '@/lib/firestore-client'

type SearchResult = { id: string; label: string; sub?: string; href: string; type: 'cliente' | 'tarefa' }

type CommandPaletteItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  telaKey?: TelaKey
}

const NAV_ITEMS: CommandPaletteItem[] = [
  { label: 'Hoje', href: '/hoje', icon: Clock3, telaKey: 'hoje' },
  { label: 'Dashboard', href: '/dashboard', icon: BarChart3, telaKey: 'dashboard' },
  { label: 'Clientes', href: '/clientes', icon: Users, telaKey: 'clientes' },
  { label: 'Tarefas', href: '/tarefas', icon: ClipboardList, telaKey: 'tarefas' },
  { label: 'Competências', href: '/competencias', icon: Layers, telaKey: 'competencias' },
  { label: 'Fechamento Mensal', href: '/fechamento', icon: FolderOpen, telaKey: 'fechamento' },
  { label: 'Emitir NFS-e', href: '/fiscal', icon: Receipt, telaKey: 'fiscal' },
  { label: 'Emitir NF-e', href: '/fiscal/emitir-nfe', icon: Receipt, telaKey: 'fiscal' },
  { label: 'Produtos (NF-e)', href: '/fiscal/produtos', icon: Package2, telaKey: 'fiscal' },
  { label: 'Histórico de Emissões', href: '/fiscal/historico', icon: Receipt, telaKey: 'fiscal' },
  { label: 'Imposto de Renda', href: '/ir', icon: FileText, telaKey: 'ir' },
  { label: 'Financeiro', href: '/financeiro', icon: Wallet, telaKey: 'financeiro' },
  { label: 'Admin', href: '/admin', icon: Settings, telaKey: 'admin' },
  { label: 'Usuários', href: '/admin/usuarios', icon: Users, telaKey: 'admin' },
]

const QUICK_ACTIONS: CommandPaletteItem[] = [
  { label: 'Novo cliente', href: '/clientes/novo', icon: Plus, telaKey: 'clientes' },
  { label: 'Nova tarefa', href: '/tarefas/nova', icon: CheckSquare, telaKey: 'tarefas' },
  { label: 'Nova competência', href: '/competencias/nova', icon: Layers, telaKey: 'competencias' },
  { label: 'Novo lançamento', href: '/financeiro/novo', icon: DollarSign, telaKey: 'financeiro' },
  { label: 'Emitir NFS-e', href: '/fiscal?emitir=1', icon: Receipt, telaKey: 'fiscal' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [favoritesVersion, setFavoritesVersion] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { usuario } = useAuth()

  const canSeeItem = useCallback((item: CommandPaletteItem) => {
    if (item.telaKey) return canAccessTela(usuario, item.telaKey)
    return true
  }, [usuario])

  const navItems = NAV_ITEMS.filter(canSeeItem)
  const quickActions = QUICK_ACTIONS.filter(canSeeItem)
  const currentItem = NAV_ITEMS.find((item) => item.href === pathname && canSeeItem(item))
  const isCurrentFavorite = currentItem ? isFavoriteNavigation(currentItem.href) : false
  const favoriteItems = open
    ? getFavoriteNavigation()
      .map((favorite) => {
        const source = NAV_ITEMS.find((item) => item.href === favorite.href)
        return source ? { ...source, label: favorite.label } : null
      })
      .filter((item): item is CommandPaletteItem => Boolean(item && canSeeItem(item)))
      .slice(0, 5)
    : []
  const recentItems = open
    ? getRecentNavigation()
      .map((recent) => {
        const source = NAV_ITEMS.find((item) => item.href === recent.href)
        return source ? { ...source, label: recent.label } : null
      })
      .filter((item): item is CommandPaletteItem => Boolean(item && canSeeItem(item)))
      .slice(0, 5)
    : []

  void favoritesVersion

  // Debounced contextual search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const [clientes, tarefas] = await Promise.all([
          listDocuments('clientes', [
            where('razaoSocial', '>=', q),
            where('razaoSocial', '<=', q + ''),
            where('status', '==', 'ativo'),
            orderBy('razaoSocial'),
            limit(5),
          ]).catch(() => []),
          listDocuments('tarefas', [
            where('titulo', '>=', q),
            where('titulo', '<=', q + ''),
            where('status', 'in', ['pendente', 'em_andamento']),
            orderBy('titulo'),
            limit(5),
          ]).catch(() => []),
        ])
        const results: SearchResult[] = [
          ...(clientes as Array<Record<string, unknown>>).map(c => ({
            id: c.id as string,
            label: (c.razaoSocial as string) ?? '—',
            sub: (c.nomeFantasia as string | undefined),
            href: `/clientes/${c.id as string}`,
            type: 'cliente' as const,
          })),
          ...(tarefas as Array<Record<string, unknown>>).map(t => ({
            id: t.id as string,
            label: (t.titulo as string) ?? 'Tarefa',
            sub: (t.clienteNome as string | undefined),
            href: `/tarefas/${t.id as string}`,
            type: 'tarefa' as const,
          })),
        ]
        setSearchResults(results)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

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

  useEffect(() => {
    const current = NAV_ITEMS.find((item) => item.href === pathname)
    if (current && canSeeItem(current)) {
      rememberNavigation({ href: current.href, label: current.label })
    }
  }, [pathname, canSeeItem])

  function go(item: CommandPaletteItem) {
    rememberNavigation({ href: item.href, label: item.label })
    setOpen(false)
    router.push(item.href)
  }

  const clientesResults = searchResults.filter(r => r.type === 'cliente')
  const tarefasResults  = searchResults.filter(r => r.type === 'tarefa')
  const hasSearchResults = searchResults.length > 0
  const isSearching = searchQuery.trim().length >= 2

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar clientes, tarefas ou páginas..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>{searching ? 'Buscando...' : 'Nenhum resultado.'}</CommandEmpty>

        {/* Contextual search results */}
        {isSearching && hasSearchResults && (
          <>
            {clientesResults.length > 0 && (
              <CommandGroup heading="Clientes">
                {clientesResults.map((r) => (
                  <CommandItem key={r.id} onSelect={() => { setOpen(false); router.push(r.href) }} className="gap-2">
                    <Users size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{r.label}</span>
                    {r.sub && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{r.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {tarefasResults.length > 0 && (
              <CommandGroup heading="Tarefas">
                {tarefasResults.map((r) => (
                  <CommandItem key={r.id} onSelect={() => { setOpen(false); router.push(r.href) }} className="gap-2">
                    <ClipboardList size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{r.label}</span>
                    {r.sub && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{r.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
          </>
        )}

        {/* Static items (only when not in search mode or no results yet) */}
        {!isSearching && (
          <>
            {favoriteItems.length > 0 && (
              <>
                <CommandGroup heading="Favoritos">
                  {favoriteItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <CommandItem key={item.href} onSelect={() => go(item)} className="gap-2">
                        <Icon size={14} className="text-muted-foreground shrink-0" />
                        {item.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {recentItems.length > 0 && (
              <>
                <CommandGroup heading="Recentes">
                  {recentItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <CommandItem key={item.href} onSelect={() => go(item)} className="gap-2">
                        <Icon size={14} className="text-muted-foreground shrink-0" />
                        {item.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Navegação">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem key={item.href} onSelect={() => go(item)} className="gap-2">
                    <Icon size={14} className="text-muted-foreground shrink-0" />
                    {item.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Ações rápidas">
              {quickActions.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem key={item.href} onSelect={() => go(item)} className="gap-2">
                    <Icon size={14} className="text-muted-foreground shrink-0" />
                    {item.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
      {currentItem && (
        <div className="border-t border-border/70 p-2">
          <button
            type="button"
            onClick={() => {
              toggleFavoriteNavigation({ href: currentItem.href, label: currentItem.label })
              setFavoritesVersion((value) => value + 1)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Star size={13} className={isCurrentFavorite ? 'fill-primary text-primary' : ''} />
            {isCurrentFavorite ? 'Remover página atual dos favoritos' : 'Favoritar página atual'}
          </button>
        </div>
      )}
    </CommandDialog>
  )
}
