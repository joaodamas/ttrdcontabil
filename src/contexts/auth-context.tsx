'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onSession, signOut, type UserSession } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
import { invalidateUsuariosCache } from '@/lib/firestore-client'

interface AuthContextValue {
  usuario: UserSession | null
  loading: boolean
  /** Login derrubado por falta de acesso (sem perfil, inativo, excluído). */
  semAcesso: { motivo: string; email: string | null } | null
  logout: () => Promise<void>
  limparSemAcesso: () => void
}

export const LOGOUT_EXPLICITO_KEY = 'auth:logout-explicito'

const AuthContext = createContext<AuthContextValue>({
  usuario: null,
  loading: true,
  semAcesso: null,
  logout:  async () => {},
  limparSemAcesso: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [semAcesso, setSemAcesso] = useState<AuthContextValue['semAcesso']>(null)

  useEffect(() => {
    const unsub = onSession((estado) => {
      if (estado.tipo === 'ativo') {
        setSemAcesso(null)
        setUsuario(estado.usuario)
      } else {
        // Desativado/excluído no meio da sessão: some com tudo que estava em
        // cache antes de mostrar a tela de sem acesso.
        if (estado.tipo === 'sem_acesso') {
          queryClient.clear()
          invalidateUsuariosCache()
          setSemAcesso({ motivo: estado.motivo, email: estado.email })
        }
        setUsuario(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function logout() {
    // O AuthGuard guarda a tela atual em ?from= ao perder a sessão; num logout
    // explícito isso mandaria o PRÓXIMO usuário para a tela do anterior.
    try { window.sessionStorage.setItem(LOGOUT_EXPLICITO_KEY, '1') } catch {}
    await signOut()
    // Cache é global à aba: sem limpar, quem logasse em seguida via por até
    // 10 min os dados (e o tenant) do usuário anterior.
    queryClient.clear()
    invalidateUsuariosCache()
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, loading, semAcesso, logout, limparSemAcesso: () => setSemAcesso(null) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
