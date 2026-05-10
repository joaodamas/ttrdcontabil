'use client'

import { AuthProvider } from '@/contexts/auth-context'
import { AuthGuard } from '@/components/auth/auth-guard'
import { AppSidebar, MobileSidebarTrigger } from '@/components/layout/app-sidebar'
import { CommandPalette } from '@/components/layout/command-palette'
import { MobileFab } from '@/components/layout/mobile-fab'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/error-boundary'
import { QueryProvider } from '@/components/providers/query-provider'
import { useAuth } from '@/contexts/auth-context'
import { FeatureFlagsProvider, useFeatureFlags } from '@/contexts/feature-flags-context'
import { Search, Plus } from 'lucide-react'
import Link from 'next/link'

function TopBar() {
  const { usuario } = useAuth()
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4">
      <MobileSidebarTrigger />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
        className="hidden sm:flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Search size={13} />
        <span className="text-xs">Buscar</span>
        <kbd className="ml-1 hidden lg:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>
      {usuario && (
        <Link
          href="/fiscal?emitir=1"
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
        >
          <Plus size={13} strokeWidth={2.5} />
          <span className="hidden sm:inline">Novo</span>
        </Link>
      )}
    </header>
  )
}

function DashboardChrome({ children }: { children: React.ReactNode }) {
  const { isEnabled } = useFeatureFlags()

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      data-premium-ui={isEnabled('premiumUiEnabled') ? 'on' : 'off'}
      data-dashboard-v2={isEnabled('dashboardV2Enabled') ? 'on' : 'off'}
      data-table-v2={isEnabled('tableV2Enabled') ? 'on' : 'off'}
      data-modal-v2={isEnabled('modalV2Enabled') ? 'on' : 'off'}
      data-sidebar-v2={isEnabled('sidebarV2Enabled') ? 'on' : 'off'}
    >
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AuthGuard>
          <FeatureFlagsProvider>
            <DashboardChrome>
              {children}
            </DashboardChrome>
            <CommandPalette />
            <MobileFab />
            <Toaster richColors position="top-right" />
          </FeatureFlagsProvider>
        </AuthGuard>
      </AuthProvider>
    </QueryProvider>
  )
}
