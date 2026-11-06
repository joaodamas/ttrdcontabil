/**
 * Utilitário de criptografia AES-256-GCM para credenciais sensíveis.
 * A chave é lida da variável de ambiente CREDENTIAL_KEY (32 bytes em hex).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_HEX   = process.env.CREDENTIAL_KEY ?? ''

function getKey(): Buffer {
  if (KEY_HEX && KEY_HEX.length === 64) {
    return Buffer.from(KEY_HEX, 'hex')
  }
  throw new Error('CREDENTIAL_KEY ausente ou inválida. Configure uma chave hex de 32 bytes antes de salvar credenciais fiscais.')
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

// ─── Arquivos binários (certificado A1 no Storage) ──────────────────────────

/**
 * Envelope de arquivo cifrado, versão 1: `JPC1` (4 bytes) + iv (12) + authTag
 * (16) + cifra. Mesma chave (CREDENTIAL_KEY) e algoritmo das credenciais.
 * O prefixo não colide com os formatos legados do .pfx no Storage: DER
 * PKCS#12 começa com 0x30 e o base64 em texto começa com "MI".
 */
export const ENVELOPE_ARQUIVO_V1 = Buffer.from('JPC1', 'ascii')
/** Valor do metadado `cifrado` gravado junto do objeto no Storage. */
export const VERSAO_ENVELOPE_ARQUIVO = 'aes-256-gcm-v1'

export function arquivoCifrado(conteudo: Buffer): boolean {
  return conteudo.length > ENVELOPE_ARQUIVO_V1.length + 28
    && conteudo.subarray(0, ENVELOPE_ARQUIVO_V1.length).equals(ENVELOPE_ARQUIVO_V1)
}

export function cifrarArquivo(conteudo: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const cifra = Buffer.concat([cipher.update(conteudo), cipher.final()])
  return Buffer.concat([ENVELOPE_ARQUIVO_V1, iv, cipher.getAuthTag(), cifra])
}

/** Decifra um envelope de cifrarArquivo(). Lança se a chave ou o conteúdo não conferirem. */
export function decifrarArquivo(envelope: Buffer): Buffer {
  if (!arquivoCifrado(envelope)) throw new Error('Arquivo fora do envelope cifrado da plataforma.')
  const inicio = ENVELOPE_ARQUIVO_V1.length
  const decipher = createDecipheriv(ALGORITHM, getKey(), envelope.subarray(inicio, inicio + 12))
  decipher.setAuthTag(envelope.subarray(inicio + 12, inicio + 28))
  return Buffer.concat([decipher.update(envelope.subarray(inicio + 28)), decipher.final()])
}
