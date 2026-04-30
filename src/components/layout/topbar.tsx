'use client'

import { memo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela, type TelaKey } from '@/lib/permissions'
import {
  Plus,
  Bell,
  ChevronRight,
  Users,
  CheckSquare,
  Receipt,
  FileText,
  DollarSign,
} from 'lucide-react'

// ── Breadcrumb ────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  dashboard:         'Dashboard',
  clientes:          'Clientes',
  novo:              'Novo',
  servicos:          'Serviços',
  competencias:      'Competências',
  nova:              'Nova',
  tarefas:           'Tarefas',
  ir:                'Imposto de Renda',
  financeiro:        'Financeiro',
  fiscal:            'Fiscal / NFS-e',
  emitir:            'Emitir',
  fechamento:        'Fechamento Mensal',
  documentos:        'Documentos',
  admin:             'Administração',
  usuarios:          'Usuários',
  configuracoes:     'Configurações',
}

function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  return (
    <nav className="flex items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const label = ROUTE_LABELS[seg] ?? seg
        const isLast = i === segments.length - 1
        const href = '/' + segments.slice(0, i + 1).join('/')
        return (
          <span key={href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">{label}</span>
            ) : (
              <Link href={href} className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]">
                {label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

// ── Quick Actions ─────────────────────────────────────────────

type QuickAction = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  perfis?: string[]
  telaKey?: TelaKey
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Novo Cliente',    href: '/clientes/novo',    icon: Users, telaKey: 'clientes' },
  { label: 'Nova Tarefa',     href: '/tarefas/nova',     icon: CheckSquare, telaKey: 'tarefas' },
  { label: 'Nova Declaração', href: '/ir/nova',          icon: FileText, telaKey: 'ir', perfis: ['admin', 'fiscal'] },
  { label: 'Novo Lançamento', href: '/financeiro/novo',  icon: DollarSign, telaKey: 'financeiro', perfis: ['admin', 'financeiro'] },
  { label: 'Emitir NFS-e',    href: '/fiscal/emitir',    icon: Receipt, telaKey: 'fiscal', perfis: ['admin', 'fiscal', 'financeiro'] },
]

function QuickActionsButton() {
  const { usuario } = useAuth()
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

  function canSeeAction(action: QuickAction) {
    if (action.perfis && (!usuario || !action.perfis.includes(usuario.perfil))) return false
    if (action.telaKey) return canAccessTela(usuario, action.telaKey)
    return true
  }

  const visibleBase = QUICK_ACTIONS.filter(canSeeAction)

  const contextual: QuickAction[] = []
  const pathParts = pathname.split('/').filter(Boolean)
  const clienteIdCtx = pathParts[0] === 'clientes' && pathParts[1] ? pathParts[1] : null
  if (pathname.startsWith('/clientes/')) {
    contextual.push({
      label: 'Nova Tarefa (Cliente)',
      href: clienteIdCtx ? `/tarefas/nova?clienteId=${clienteIdCtx}` : '/tarefas/nova',
      icon: CheckSquare,
    })
    contextual.push({
      label: 'Novo Lançamento (Cliente)',
      href: clienteIdCtx ? `/financeiro/novo?clienteId=${clienteIdCtx}` : '/financeiro/novo',
      icon: DollarSign,
    })
  } else if (pathname.startsWith('/tarefas')) {
    contextual.push({ label: 'Nova Tarefa', href: '/tarefas/nova', icon: CheckSquare })
  } else if (pathname.startsWith('/financeiro')) {
    contextual.push({ label: 'Novo Lançamento', href: '/financeiro/novo', icon: DollarSign })
  } else if (pathname.startsWith('/fiscal')) {
    contextual.push({ label: 'Emitir NFS-e', href: '/fiscal/emitir', icon: Receipt, perfis: ['admin', 'fiscal', 'financeiro'], telaKey: 'fiscal' })
  }

  const visible = [...contextual, ...visibleBase].filter(
    (a, idx, arr) => arr.findIndex((x) => x.label === a.label && x.href === a.href) === idx
  ).filter(canSeeAction)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all',
          'hover:opacity-90 active:scale-95',
          open && 'opacity-90'
        )}
        style={{ background: '#F5C200', color: '#0a0a0a' }}
      >
        <Plus size={15} strokeWidth={2.5} />
        Ação rápida
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 w-52 rounded-xl py-1.5 z-50 overflow-hidden"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          {visible.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-foreground/70 hover:text-foreground hover:bg-muted"
              >
                <div className="w-6 h-6 rounded-md flex items-center justify-center bg-muted shrink-0">
                  <Icon size={13} className="text-muted-foreground" />
                </div>
                {action.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Topbar ────────────────────────────────────────────────────

export const Topbar = memo(function Topbar() {
  return (
    <header className="surface-subtle sticky top-0 z-30 mx-4 mt-3 mb-1 flex min-h-14 shrink-0 items-center justify-between gap-4 border px-4 sm:mx-6 sm:px-5">
      <div className="flex-1 min-w-0">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <QuickActionsButton />

        <button
          aria-label="Notificações"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          <Bell size={16} />
        </button>
      </div>
    </header>
  )
})
