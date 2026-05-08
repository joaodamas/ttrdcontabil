export function getPathSegmentAfter(pathname: string, marker: string): string {
  const runtimePathname = typeof window !== 'undefined'
    ? window.location.pathname
    : pathname
  const parts = runtimePathname.split('?')[0].split('/').filter(Boolean)
  const index = parts.indexOf(marker)
  const value = index >= 0 ? parts[index + 1] : undefined
  return value ? decodeURIComponent(value) : ''
}
