'use client'

import { memo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
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
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Novo Cliente',    href: '/clientes/novo',    icon: Users },
  { label: 'Nova Tarefa',     href: '/tarefas/nova',     icon: CheckSquare },
  { label: 'Nova Declaração', href: '/ir/nova',           icon: FileText },
  { label: 'Novo Lançamento', href: '/financeiro/novo',  icon: DollarSign },
  { label: 'Emitir NFS-e',   href: '/fiscal/emitir',    icon: Receipt, perfis: ['admin', 'fiscal', 'financeiro'] },
]

function QuickActionsButton() {
  const { usuario } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const visible = QUICK_ACTIONS.filter(
    (a) => !a.perfis || (usuario && a.perfis.includes(usuario.perfil))
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all',
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
    <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-5 border-b border-border bg-background">
      <div className="flex-1 min-w-0">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <QuickActionsButton />

        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Bell size={16} />
        </button>
      </div>
    </header>
  )
})
