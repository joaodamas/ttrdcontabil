import { decrypt, isEncrypted } from '../encrypt'

export function lerCredencial(
  value: string | undefined,
  label: string,
): { valor?: string; criptografada: boolean; erro?: string; codigoErro?: string } {
  if (!value) return { criptografada: false }

  const criptografada = isEncrypted(value)
  if (!criptografada) return { valor: value, criptografada }

  const valor = decrypt(value)
  if (valor) return { valor, criptografada }

  return {
    criptografada,
    codigoErro: 'CREDENCIAL_DECRYPT_FAILED',
    erro: `${label} está criptografada, mas não foi possível descriptografar. Verifique o secret CREDENTIAL_KEY da Cloud Function e salve novamente a credencial fiscal.`,
  }
}

export function stringifyErroHttp(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 1000)
  try { return JSON.stringify(data).slice(0, 1000) } catch { return String(data).slice(0, 1000) }
}
