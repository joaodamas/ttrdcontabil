const RECENT_NAVIGATION_KEY = 'ttrd:recent-navigation'
const FAVORITE_NAVIGATION_KEY = 'ttrd:favorite-navigation'
const MAX_RECENT_ITEMS = 8
const MAX_FAVORITE_ITEMS = 8

export type RecentNavigationItem = {
  href: string
  label: string
  visitedAt: number
}

export type FavoriteNavigationItem = {
  href: string
  label: string
  savedAt: number
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getRecentNavigation(): RecentNavigationItem[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(RECENT_NAVIGATION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is RecentNavigationItem => {
        return (
          item &&
          typeof item.href === 'string' &&
          typeof item.label === 'string' &&
          typeof item.visitedAt === 'number'
        )
      })
      .slice(0, MAX_RECENT_ITEMS)
  } catch {
    return []
  }
}

export function rememberNavigation(item: Pick<RecentNavigationItem, 'href' | 'label'>) {
  if (!canUseStorage() || !item.href || !item.label) return

  const current = getRecentNavigation()
  const next = [
    { ...item, visitedAt: Date.now() },
    ...current.filter((recent) => recent.href !== item.href),
  ].slice(0, MAX_RECENT_ITEMS)

  window.localStorage.setItem(RECENT_NAVIGATION_KEY, JSON.stringify(next))
}

export function getFavoriteNavigation(): FavoriteNavigationItem[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(FAVORITE_NAVIGATION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is FavoriteNavigationItem => {
        return (
          item &&
          typeof item.href === 'string' &&
          typeof item.label === 'string' &&
          typeof item.savedAt === 'number'
        )
      })
      .slice(0, MAX_FAVORITE_ITEMS)
  } catch {
    return []
  }
}

export function isFavoriteNavigation(href: string) {
  return getFavoriteNavigation().some((item) => item.href === href)
}

export function toggleFavoriteNavigation(item: Pick<FavoriteNavigationItem, 'href' | 'label'>) {
  if (!canUseStorage() || !item.href || !item.label) return []

  const current = getFavoriteNavigation()
  const exists = current.some((favorite) => favorite.href === item.href)
  const next = exists
    ? current.filter((favorite) => favorite.href !== item.href)
    : [{ ...item, savedAt: Date.now() }, ...current].slice(0, MAX_FAVORITE_ITEMS)

  window.localStorage.setItem(FAVORITE_NAVIGATION_KEY, JSON.stringify(next))
  return next
}
