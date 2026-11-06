// @vitest-environment node
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  ErroCredencial,
  abrirCredenciais,
  camposEmTextoPuro,
  pareceCifrado,
  validarCamposLeitura,
  validarClienteId,
  validarCredenciaisParaSalvar,
} from '../../functions/src/clientes/credenciais-regras'

// Mesmo formato do helper das functions (functions/src/nfse/encrypt.ts).
const KEY = randomBytes(32)
function cifrar(texto: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':')
}
function decifrar(v: string): string | null {
  try {
    const [iv, tag, enc] = v.split(':')
    const d = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'hex'))
    d.setAuthTag(Buffer.from(tag, 'hex'))
    return Buffer.concat([d.update(Buffer.from(enc, 'hex')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

describe('validação dos callables de senhas de portal', () => {
  it('clienteId: só id de documento (sem barra, sem vazio)', () => {
    expect(validarClienteId('abc_123-X')).toBe('abc_123-X')
    for (const ruim of ['', 'a/b', '../x', 123, null, 'x'.repeat(129)]) {
      expect(() => validarClienteId(ruim)).toThrow(ErroCredencial)
    }
  })

  it('campos de leitura: ausente = todos; desconhecido = erro; ordem canônica', () => {
    expect(validarCamposLeitura(undefined)).toHaveLength(9)
    expect(validarCamposLeitura(['senhaPostoFiscal', 'loginPrefeitura'])).toEqual(['loginPrefeitura', 'senhaPostoFiscal'])
    expect(() => validarCamposLeitura(['razaoSocial'])).toThrow(ErroCredencial)
  })

  it('gravação: vazio/null apaga; campo fora da lista, não-texto ou longo demais é recusado', () => {
    expect(validarCredenciaisParaSalvar({ senhaWebPrefeitura: 'x', loginPrefeitura: '', senhaPostoFiscal: null })).toEqual({
      gravar: { senhaWebPrefeitura: 'x' },
      apagar: ['loginPrefeitura', 'senhaPostoFiscal'],
    })
    expect(() => validarCredenciaisParaSalvar({ razaoSocial: 'x' })).toThrow(ErroCredencial)
    expect(() => validarCredenciaisParaSalvar({ senhaWebPrefeitura: 123 })).toThrow(ErroCredencial)
    expect(() => validarCredenciaisParaSalvar({ senhaWebPrefeitura: 'x'.repeat(501) })).toThrow(ErroCredencial)
    expect(() => validarCredenciaisParaSalvar(null)).toThrow(ErroCredencial)
    expect(() => validarCredenciaisParaSalvar(['x'])).toThrow(ErroCredencial)
  })
})

describe('cifra das senhas de portal', () => {
  it('reconhece o formato iv:tag:cifra e não confunde senha com dois-pontos', () => {
    expect(pareceCifrado(cifrar('s3nh@'))).toBe(true)
    expect(pareceCifrado('abc:def:123')).toBe(false)
    expect(pareceCifrado('minha:senha:boa')).toBe(false)
    expect(pareceCifrado('senha')).toBe(false)
  })

  it('abre cifrado, aceita texto puro legado e marca o que não decifra (sem devolver o cifrado)', () => {
    const outraChave = (() => {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', randomBytes(32), iv)
      const enc = Buffer.concat([c.update('x'), c.final()])
      return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':')
    })()
    const doc = {
      senhaWebPrefeitura: cifrar('prefeitura123'),
      loginPrefeitura: 'login-em-texto-puro',
      senhaPostoFiscal: outraChave,
      responsavelSenhaMeuGov: '',
      razaoSocial: 'ignorada',
    }
    const r = abrirCredenciais(doc, ['senhaWebPrefeitura', 'loginPrefeitura', 'senhaPostoFiscal', 'responsavelSenhaMeuGov'], decifrar)
    expect(r.valores).toEqual({ senhaWebPrefeitura: 'prefeitura123', loginPrefeitura: 'login-em-texto-puro' })
    expect(r.ilegiveis).toEqual(['senhaPostoFiscal'])
    expect(JSON.stringify(r)).not.toContain(outraChave)
  })

  it('só os campos pedidos saem (revelação campo a campo)', () => {
    const doc = { senhaWebPrefeitura: cifrar('a'), senhaPostoFiscal: cifrar('b') }
    expect(abrirCredenciais(doc, ['senhaPostoFiscal'], decifrar).valores).toEqual({ senhaPostoFiscal: 'b' })
    expect(abrirCredenciais(null, ['senhaPostoFiscal'], decifrar).valores).toEqual({})
  })

  it('migração: lista só os campos ainda em texto puro', () => {
    expect(camposEmTextoPuro({ senhaWebPrefeitura: cifrar('a'), loginPrefeitura: 'puro', senhaPostoFiscal: ' ' })).toEqual(['loginPrefeitura'])
    expect(camposEmTextoPuro(undefined)).toEqual([])
  })
})
