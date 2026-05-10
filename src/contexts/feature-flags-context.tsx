'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { fetchParametrosEscritorio } from '@/features/admin/services'
import type { UiFeatureFlags } from '@/features/admin/types'
import {
  DEFAULT_UI_FEATURE_FLAGS,
  isUiFeatureEnabled,
  normalizeUiFeatureFlags,
  type UiFeatureFlagKey,
} from '@/lib/feature-flags'

type FeatureFlagsContextValue = {
  flags: UiFeatureFlags
  loading: boolean
  isEnabled: (key: UiFeatureFlagKey) => boolean
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth()
  const [flags, setFlags] = useState<UiFeatureFlags>(DEFAULT_UI_FEATURE_FLAGS)

  useEffect(() => {
    let mounted = true

    if (!usuario?.tenantId) {
      return () => {
        mounted = false
      }
    }

    fetchParametrosEscritorio(usuario.tenantId)
      .then((result) => {
        if (!mounted) return
        setFlags(normalizeUiFeatureFlags(result.data.uiFeatureFlags))
      })
      .catch(() => {
        if (!mounted) return
        setFlags(DEFAULT_UI_FEATURE_FLAGS)
      })

    return () => {
      mounted = false
    }
  }, [usuario?.tenantId])

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({
      flags,
      loading: false,
      isEnabled: (key) => isUiFeatureEnabled(flags, key),
    }),
    [flags]
  )

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext)
  if (!context) {
    return {
      flags: DEFAULT_UI_FEATURE_FLAGS,
      loading: false,
      isEnabled: () => false,
    } satisfies FeatureFlagsContextValue
  }
  return context
}
