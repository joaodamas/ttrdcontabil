'use client'

import { AuthProvider } from '@/contexts/auth-context'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/error-boundary'
import { QueryProvider } from '@/components/providers/query-provider'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AuthGuard>
          <div className="flex min-h-screen bg-background">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Topbar />
              <main className="flex-1 px-6 py-6 overflow-auto">
                <div className="max-w-[1280px] mx-auto">
                  <ErrorBoundary>
                    {children}
                  </ErrorBoundary>
                </div>
              </main>
            </div>
          </div>
          <Toaster richColors position="top-right" />
        </AuthGuard>
      </AuthProvider>
    </QueryProvider>
  )
}
