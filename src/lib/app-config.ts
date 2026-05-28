const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME,
  appShortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME,
  appTagline: process.env.NEXT_PUBLIC_APP_TAGLINE,
  tenantId: process.env.NEXT_PUBLIC_APP_TENANT_ID,
  brandPrimary: process.env.NEXT_PUBLIC_APP_BRAND_PRIMARY,
  logoUrl: process.env.NEXT_PUBLIC_APP_LOGO_URL,
}

function clean(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export const appConfig = {
  name: clean(env.appName, 'TTRD Contábil'),
  shortName: clean(env.appShortName, 'TTRD'),
  tagline: clean(env.appTagline, 'Gestão Contábil Integrada'),
  tenantId: clean(env.tenantId, 'ttrd'),
  brandPrimary: clean(env.brandPrimary, '#2243A5'),
  logoUrl: env.logoUrl?.trim() || null,
}

