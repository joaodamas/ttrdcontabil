/**
 * Utilitário de criptografia AES-256-GCM para credenciais sensíveis.
 * A chave é lida da variável de ambiente CREDENTIAL_KEY (32 bytes em hex).
 * Se não estiver definida (ex: ambiente de dev), usa uma chave de fallback
 * com aviso — NUNCA usar o fallback em produção.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_HEX   = process.env.CREDENTIAL_KEY ?? ''

function getKey(): Buffer {
  if (KEY_HEX && KEY_HEX.length === 64) {
    return Buffer.from(KEY_HEX, 'hex')
  }
  // Fallback de desenvolvimento — NÃO usar em produção
  console.warn('[encrypt] CREDENTIAL_KEY não configurada. Usando chave de fallback. Configure a variável de ambiente.')
  return Buffer.from('ttrdcontabil_dev_key_32bytes_____', 'utf8').subarray(0, 32)
}

/**
 * Criptografa um valor string com AES-256-GCM.
 * Retorna string no formato: iv:authTag:ciphertext (tudo em hex).
 */
export function encrypt(plaintext: string): string {
  const key   = getKey()
  const iv    = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

/**
 * Decriptografa um valor gerado por encrypt().
 * Retorna null se o valor não estiver no formato esperado ou a decriptografia falhar.
 */
export function decrypt(ciphertext: string): string | null {
  try {
    const parts = ciphertext.split(':')
    if (parts.length !== 3) return null

    const [ivHex, authTagHex, encryptedHex] = parts
    const key      = getKey()
    const iv       = Buffer.from(ivHex, 'hex')
    const authTag  = Buffer.from(authTagHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Verifica se um valor já está criptografado (no formato iv:authTag:ciphertext).
 * Útil para evitar dupla criptografia.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p))
}
