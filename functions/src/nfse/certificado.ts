export function pfxBase64FromStorageBuffer(buffer: Buffer): string {
  const maybeBase64 = buffer.toString('utf8').trim()
  const normalized = maybeBase64.replace(/\s+/g, '')

  // Compatibilidade com certificados salvos anteriormente como texto base64.
  if (
    normalized.length > 100
    && normalized.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    return normalized
  }

  return buffer.toString('base64')
}
