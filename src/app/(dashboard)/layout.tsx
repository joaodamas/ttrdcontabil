import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { AuthProvider } from '@/contexts/auth-context'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const usuario = {
    id: session.uid,
    nome: session.nome,
    email: session.email,
    perfil: session.perfil,
  }

  return (
    <AuthProvider usuario={usuario}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}
