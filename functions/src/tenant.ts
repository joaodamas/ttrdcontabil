import { HttpsError } from 'firebase-functions/v2/https'

export const DEFAULT_TENANT_ID = process.env.APP_TENANT_ID ?? process.env.NEXT_PUBLIC_APP_TENANT_ID ?? 'ttrd'

export function requireTenantId(value: unknown, message = 'Tenant do ambiente não configurado.') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('permission-denied', message)
  }
  return value.trim()
}

export function requireEnvironmentTenant(value: unknown, entity = 'Registro') {
  const tenantId = requireTenantId(value, `${entity} sem tenant configurado.`)
  if (tenantId !== DEFAULT_TENANT_ID) {
    throw new HttpsError('permission-denied', `${entity} pertence a outro ambiente.`)
  }
  return tenantId
}
