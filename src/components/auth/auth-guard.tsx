'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LOGOUT_EXPLICITO_KEY, useAuth } from '@/contexts/auth-context'
import { Loader2, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { canAccessTela, TELA_LABELS, telaDaRota, type TelaKey } from '@/lib/permissions'

const getTelaFromPath = telaDaRota

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
  return firstAllowed?.href ?? '/hoje'
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { usuario, loading, semAcesso, limparSemAcesso } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Sem acesso: fica na tela explicando o motivo (abaixo) até o clique.
    if (!loading && !usuario && semAcesso) return

    if (!loading && !usuario) {
      // Devolve o usuário à tela que ele tentou abrir (o login sanitiza o from),
      // exceto quando ele mesmo saiu.
      let logoutExplicito = false
      try {
        logoutExplicito = window.sessionStorage.getItem(LOGOUT_EXPLICITO_KEY) === '1'
        window.sessionStorage.removeItem(LOGOUT_EXPLICITO_KEY)
      } catch {}
      const from = window.location.pathname + window.location.search
      router.replace(!logoutExplicito && from !== '/' ? `/login?from=${encodeURIComponent(from)}` : '/login')
      return
    }

    if (!loading && usuario) {
      const tela = getTelaFromPath(pathname)
      if (tela && !canAccessTela(usuario, tela)) {
        const fallback = getFirstAllowedRoute(usuario)
        if (pathname !== fallback) {
          // Sem o aviso, o redirecionamento parecia um clique que "não pegou".
          // id fixo: o efeito pode rodar de novo antes da troca de rota.
          toast.error(`Você não tem acesso a ${TELA_LABELS[tela]}.`, { id: 'sem-acesso-tela' })
          router.replace(fallback)
        }
      }
    }
  }, [usuario, loading, semAcesso, router, pathname])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!usuario && semAcesso) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center">
          <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="space-y-1">
            <h1 className="text-base font-semibold">Sem acesso</h1>
            <p className="text-sm text-muted-foreground">{semAcesso.motivo}</p>
            {semAcesso.email && <p className="text-xs text-muted-foreground">Conta: {semAcesso.email}</p>}
          </div>
          <Button
            size="sm"
            onClick={() => {
              limparSemAcesso()
              router.replace('/login')
            }}
          >
            Voltar ao login
          </Button>
        </div>
      </div>
    )
  }

  if (!usuario) return null

  return <>{children}</>
}
