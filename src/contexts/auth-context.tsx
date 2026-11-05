'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onSession, signOut, type UserSession } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
import { invalidateUsuariosCache } from '@/lib/firestore-client'

interface AuthContextValue {
  usuario: UserSession | null
  loading: boolean
  logout: () => Promise<void>
}

export const LOGOUT_EXPLICITO_KEY = 'auth:logout-explicito'

const AuthContext = createContext<AuthContextValue>({
  usuario: null,
  loading: true,
  logout:  async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSession((session) => {
      setUsuario(session)
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
    <AuthContext.Provider value={{ usuario, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
