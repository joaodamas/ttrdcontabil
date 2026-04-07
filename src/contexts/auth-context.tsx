'use client'

import { createContext, useContext, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UsuarioSession {
  id: string
  nome: string
  email: string
  perfil: string
}

interface AuthContextType {
  usuario: UsuarioSession
  logout: () => Promise<void>
  isAdmin: boolean
  isFiscal: boolean
  isFinanceiro: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({
  children,
  usuario,
}: {
  children: React.ReactNode
  usuario: UsuarioSession
}) {
  const router = useRouter()

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  return (
    <AuthContext.Provider
      value={{
        usuario,
        logout,
        isAdmin: usuario.perfil === 'admin',
        isFiscal: ['admin', 'fiscal'].includes(usuario.perfil),
        isFinanceiro: ['admin', 'financeiro'].includes(usuario.perfil),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
