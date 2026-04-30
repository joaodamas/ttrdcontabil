'use client'

import { AuthProvider } from '@/contexts/auth-context'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Topnav } from '@/components/layout/topnav'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/error-boundary'
import { QueryProvider } from '@/components/providers/query-provider'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AuthGuard>
          <div className="flex flex-col min-h-screen bg-background">
            <Topnav />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-[1320px]">
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </div>
            </main>
          </div>
          <Toaster richColors position="top-right" />
        </AuthGuard>
      </AuthProvider>
    </QueryProvider>
  )
}
