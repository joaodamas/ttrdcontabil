type ServiceLike = {
  id?: string | null
  servicoId?: string | null
  nome?: string | null
  servicoNome?: string | null
  codigo?: string | null
}

const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{16,}$/

export function looksLikeOpaqueId(value?: string | null) {
  if (!value) return false
  return OPAQUE_ID_RE.test(value.trim())
}

export function formatServiceLabel(service?: ServiceLike | null, fallback = 'Serviço sem nome') {
  if (!service) return fallback
  const rawName = (service.servicoNome ?? service.nome ?? '').trim()
  const serviceId = service.servicoId ?? service.id
  const name = rawName && rawName !== serviceId && !looksLikeOpaqueId(rawName)
    ? rawName
    : ''
  const code = service.codigo?.trim()

  if (code && name) return `${code} - ${name}`
  if (name) return name
  if (code) return code
  return fallback
}
