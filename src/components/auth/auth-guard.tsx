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
        router.replace('/hoje')
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
