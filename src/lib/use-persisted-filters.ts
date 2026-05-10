'use client'

import { useState, useCallback, useEffect } from 'react'

type FilterValue = string | number | boolean | null | undefined

/**
 * Persists a record of filter values in localStorage under a given storageKey.
 * Falls back gracefully when localStorage is unavailable (SSR / incognito).
 */
export function usePersistedFilters<T extends Record<string, FilterValue>>(
  storageKey: string,
  defaults: T
): [T, (updates: Partial<T>) => void, () => void] {
  const [filters, setFilters] = useState<T>(() => {
    if (typeof window === 'undefined') return defaults
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return defaults
      return { ...defaults, ...JSON.parse(stored) } as T
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters))
    } catch { /* ignore */ }
  }, [storageKey, filters])

  const update = useCallback((updates: Partial<T>) => {
    setFilters(prev => ({ ...prev, ...updates }))
  }, [])

  const reset = useCallback(() => {
    setFilters(defaults)
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  return [filters, update, reset]
}
