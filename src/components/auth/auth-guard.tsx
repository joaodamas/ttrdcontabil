'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LOGOUT_EXPLICITO_KEY, useAuth } from '@/contexts/auth-context'
import { Loader2, ShieldCheck, ShieldOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { canAccessTela, TELA_LABELS, telaDaRota, type TelaKey } from '@/lib/permissions'
import { useLogoutInatividade } from '@/hooks/use-logout-inatividade'
import { getClientAuth } from '@/lib/firebase'
import { EVENTO_MFA_ALTERADO, lerMfaObrigatorio, perfilComSegurancaReforcada, temSegundoFator } from '@/lib/mfa'

const getTelaFromPath = telaDaRota

export const ROTA_SEGURANCA = '/conta/seguranca'
const CHAVE_DISPENSA_AVISO_MFA = 'mfa:aviso-dispensado-em'
const DISPENSA_AVISO_MS = 7 * 24 * 60 * 60_000

/**
 * Estado do 2º fator para o usuário logado: se o interruptor
 * configuracoes/seguranca.mfaObrigatorio está ligado e se a conta já tem TOTP.
 * `null` enquanto carrega.
 */
function useEstadoMfa(uid: string | null) {
  const [obrigatorio, setObrigatorio] = useState<{ uid: string; valor: boolean } | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!uid) return
    let vivo = true
    void lerMfaObrigatorio().then((valor) => { if (vivo) setObrigatorio({ uid, valor }) })
    return () => { vivo = false }
  }, [uid, versao])

  useEffect(() => {
    const aoMudar = () => setVersao((v) => v + 1)
    window.addEventListener(EVENTO_MFA_ALTERADO, aoMudar)
    return () => window.removeEventListener(EVENTO_MFA_ALTERADO, aoMudar)
  }, [])

  const carregado = !!uid && obrigatorio?.uid === uid
  // versao entra na conta para reler enrolledFactors depois do cadastro.
  const cadastrado = carregado && versao >= 0 ? temSegundoFator(getClientAuth().currentUser) : false
  return carregado ? { obrigatorio: obrigatorio!.valor, cadastrado } : null
}

function AvisoMfa({ onDispensar }: { onDispensar: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Proteja sua conta com o 2º fator</p>
        <p className="text-xs text-muted-foreground">
          Seu perfil acessa senhas de portal e certificados. Ative o código do aplicativo autenticador.
        </p>
        <Link href={ROTA_SEGURANCA} className="text-xs font-semibold text-primary hover:underline">
          Configurar agora
        </Link>
      </div>
      <button type="button" onClick={onDispensar} aria-label="Dispensar aviso" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
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
  return firstAllowed?.href ?? '/hoje'
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { usuario, loading, semAcesso, limparSemAcesso, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const reforcada = perfilComSegurancaReforcada(usuario?.perfil)
  useLogoutInatividade(reforcada, logout)
  const mfa = useEstadoMfa(reforcada ? usuario?.uid ?? null : null)
  const exigirCadastroMfa = reforcada && !!mfa?.obrigatorio && !mfa.cadastrado
  const naTelaSeguranca = pathname.startsWith(ROTA_SEGURANCA)
  const [avisoDispensado, setAvisoDispensado] = useState(() => {
    try {
      return Date.now() - Number(window.localStorage.getItem(CHAVE_DISPENSA_AVISO_MFA) ?? 0) < DISPENSA_AVISO_MS
    } catch {
      return false
    }
  })

  // Interruptor ligado e admin/fiscal sem 2º fator: só a tela de cadastro.
  useEffect(() => {
    if (exigirCadastroMfa && !naTelaSeguranca) router.replace(`${ROTA_SEGURANCA}?obrigatorio=1`)
  }, [exigirCadastroMfa, naTelaSeguranca, router])

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

  if (exigirCadastroMfa && !naTelaSeguranca) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const mostrarAvisoMfa = reforcada && mfa && !mfa.obrigatorio && !mfa.cadastrado && !avisoDispensado && !naTelaSeguranca

  return (
    <>
      {children}
      {mostrarAvisoMfa && (
        <AvisoMfa
          onDispensar={() => {
            try { window.localStorage.setItem(CHAVE_DISPENSA_AVISO_MFA, String(Date.now())) } catch {}
            setAvisoDispensado(true)
          }}
        />
      )}
    </>
  )
}
