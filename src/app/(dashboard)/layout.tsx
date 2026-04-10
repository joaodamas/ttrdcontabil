'use client'

import { AuthProvider } from '@/contexts/auth-context'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Navbar } from '@/components/layout/navbar'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/error-boundary'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <Navbar />
          <main className="max-w-[1400px] mx-auto px-4 py-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </AuthGuard>
    </AuthProvider>
  )
}
