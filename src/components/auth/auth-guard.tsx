'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Loader2 } from 'lucide-react'
import { canAccessTela, type TelaKey } from '@/lib/permissions'

function getTelaFromPath(pathname: string): TelaKey | null {
  if (pathname.startsWith('/hoje')) return 'hoje'
  if (pathname.startsWith('/clientes')) return 'clientes'
  if (pathname.startsWith('/tarefas')) return 'tarefas'
  if (pathname.startsWith('/competencias')) return 'competencias'
  if (pathname.startsWith('/fechamento')) return 'fechamento'
  if (pathname.startsWith('/financeiro')) return 'financeiro'
  if (pathname.startsWith('/fiscal')) return 'fiscal'
  if (pathname.startsWith('/ir')) return 'ir'
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  return null
}

function getFirstAllowedRoute(usuario: NonNullable<ReturnType<typeof useAuth>['usuario']>): string {
  const priority: Array<{ tela: TelaKey; href: string }> = [
    { tela: 'hoje', href: '/hoje' },
    { tela: 'dashboard', href: '/dashboard' },
    { tela: 'clientes', href: '/clientes' },
    { tela: 'tarefas', href: '/tarefas' },
    { tela: 'competencias', href: '/competencias' },
    { tela: 'fechamento', href: '/fechamento' },
    { tela: 'financeiro', href: '/financeiro' },
    { tela: 'fiscal', href: '/fiscal' },
    { tela: 'ir', href: '/ir' },
    { tela: 'servicos', href: '/admin/servicos' },
    { tela: 'admin', href: '/admin' },
  ]
  const firstAllowed = priority.find(({ tela }) => canAccessTela(usuario, tela))
  return firstAllowed?.href ?? '/dashboard'
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !usuario) {
      router.replace('/login')
      return
    }

    if (!loading && usuario) {
      const tela = getTelaFromPath(pathname)
      if (tela && !canAccessTela(usuario, tela)) {
        const fallback = getFirstAllowedRoute(usuario)
        if (pathname !== fallback) router.replace(fallback)
      }
    }
  }, [usuario, loading, router, pathname])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!usuario) return null

  return <>{children}</>
}
