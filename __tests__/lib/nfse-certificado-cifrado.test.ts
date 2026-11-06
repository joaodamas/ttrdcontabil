// @vitest-environment node
/**
 * Certificado A1 cifrado no Storage (2026-11-06): envelope AES-256-GCM com a
 * CREDENTIAL_KEY (mesmo helper das senhas), leitura do envelope e dos dois
 * formatos legados em claro (binário DER e texto base64).
 */
import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.CREDENTIAL_KEY = 'b'.repeat(64)
})

import { arquivoCifrado, cifrarArquivo, decifrarArquivo, VERSAO_ENVELOPE_ARQUIVO } from '../../functions/src/nfse/encrypt'
import { conteudoCertificadoParaStorage, pfxBase64DoArquivoStorage } from '../../functions/src/nfse/certificado'

// "PKCS#12" de mentira: começa com 0x30 0x82 como um DER de verdade.
const pfx = Buffer.concat([Buffer.from([0x30, 0x82, 0x0a, 0x10]), randomBytes(600)])
const pfxBase64 = pfx.toString('base64')

describe('envelope do arquivo', () => {
  it('ida e volta devolve os mesmos bytes; iv aleatório (duas cifras diferentes)', () => {
    const a = cifrarArquivo(pfx)
    const b = cifrarArquivo(pfx)
    expect(arquivoCifrado(a)).toBe(true)
    expect(a.equals(b)).toBe(false)
    expect(decifrarArquivo(a).equals(pfx)).toBe(true)
    expect(a.includes(pfx.subarray(0, 64))).toBe(false)
  })

  it('formatos legados não parecem envelope', () => {
    expect(arquivoCifrado(pfx)).toBe(false)
    expect(arquivoCifrado(Buffer.from(pfxBase64, 'utf8'))).toBe(false)
    expect(arquivoCifrado(Buffer.from('JPC1'))).toBe(false)
  })

  it('envelope adulterado não decifra (GCM autentica)', () => {
    const env = cifrarArquivo(pfx)
    env[env.length - 1] ^= 0xff
    expect(() => decifrarArquivo(env)).toThrow()
  })
})

describe('certificado no Storage', () => {
  it('upload grava cifrado com metadado de versão; a leitura devolve o .pfx', () => {
    const { conteudo, metadata } = conteudoCertificadoParaStorage(pfxBase64)
    expect(metadata).toEqual({ cifrado: VERSAO_ENVELOPE_ARQUIVO })
    expect(arquivoCifrado(conteudo)).toBe(true)
    expect(pfxBase64DoArquivoStorage(conteudo)).toBe(pfxBase64)
  })

  it('lê o legado em claro: binário DER e texto base64', () => {
    expect(pfxBase64DoArquivoStorage(pfx)).toBe(pfxBase64)
    expect(pfxBase64DoArquivoStorage(Buffer.from(`${pfxBase64}\n`, 'utf8'))).toBe(pfxBase64)
  })

  it('envelope que não decifra vira erro claro (não usa o envelope como .pfx)', () => {
    const env = cifrarArquivo(pfx)
    env[10] ^= 0xff
    expect(() => pfxBase64DoArquivoStorage(env)).toThrow(/decifrar o certificado/)
  })
})
