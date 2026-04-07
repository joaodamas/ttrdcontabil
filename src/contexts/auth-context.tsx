'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onSession, signOut, type UserSession } from '@/lib/auth-client'

interface AuthContextValue {
  usuario: UserSession | null
  loading: boolean
  logout: () => Promise<void>
}

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
    await signOut()
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
