const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME,
  appShortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME,
  appTagline: process.env.NEXT_PUBLIC_APP_TAGLINE,
  tenantId: process.env.NEXT_PUBLIC_APP_TENANT_ID,
  brandPrimary: process.env.NEXT_PUBLIC_APP_BRAND_PRIMARY,
  logoUrl: process.env.NEXT_PUBLIC_APP_LOGO_URL,
  logoUrlLight: process.env.NEXT_PUBLIC_APP_LOGO_URL_LIGHT,
}

function clean(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

// Iniciais para o monograma (fallback quando o cliente não tem logo próprio).
function monogram(short: string, name: string) {
  const src = (short || name || '').trim()
  const words = src.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

const name = clean(env.appName, 'TTRD Contábil')
const shortName = clean(env.appShortName, 'TTRD')

export const appConfig = {
  name,
  shortName,
  tagline: clean(env.appTagline, 'Gestão Contábil Integrada'),
  tenantId: clean(env.tenantId, 'ttrd'),
  brandPrimary: clean(env.brandPrimary, '#2243A5'),
  logoUrl: env.logoUrl?.trim() || null,
  // Variante recolorida pra sidebar/fundo claro. Sem ela, usa a mesma logo do tema escuro.
  logoUrlLight: env.logoUrlLight?.trim() || env.logoUrl?.trim() || null,
  monogram: monogram(shortName, name),
}

