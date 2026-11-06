// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  atorDaRequisicao,
  montarAuditLog,
  redactAuditData,
  requisicaoDoCallable,
} from '../../functions/src/audit'
import {
  atorDoEvento,
  camposAlterados,
  classificarEscrita,
  dadosParaLog,
} from '../../functions/src/auditoria/regras'
import { camposPreenchidos } from '../../functions/src/clientes/credenciais-campos'

describe('redator do log do servidor', () => {
  it('mantém titular e vencimento do certificado, apaga senha e caminho', () => {
    const r = redactAuditData({
      credenciais: {
        certTitular: 'EMPRESA X LTDA',
        certVencimento: '2027-01-01T00:00:00.000Z',
        certValido: true,
        certificadoSenha: 'cifrado',
        certificadoStoragePath: 'certificados/c.pfx.b64',
        spedyApiKey: 'chave',
        usuario: 'login-do-portal',
      },
      certTitular: 'EMPRESA X LTDA',
      certVencimento: '2027-01-01',
    }) as Record<string, Record<string, unknown>>
    expect(r.certTitular).toBe('EMPRESA X LTDA')
    expect(r.certVencimento).toBe('2027-01-01')
    expect(r.credenciais.certTitular).toBe('EMPRESA X LTDA')
    expect(r.credenciais.certVencimento).toBe('2027-01-01T00:00:00.000Z')
    expect(r.credenciais.certValido).toBe(true)
    expect(r.credenciais.certificadoSenha).toBe('[REDACTED]')
    expect(r.credenciais.certificadoStoragePath).toBe('[REDACTED]')
    expect(r.credenciais.spedyApiKey).toBe('[REDACTED]')
    // Dentro de um bloco de credenciais, campo sem nome "sensível" também some.
    expect(r.credenciais.usuario).toBe('[REDACTED]')
  })

  it('apaga login e senha de portal; mantém a lista de campos preenchidos', () => {
    const r = redactAuditData({
      loginPrefeitura: 'joao',
      senhaWebPrefeitura: 'x',
      credenciaisPreenchidas: ['loginPrefeitura', 'senhaWebPrefeitura'],
      razaoSocial: 'Cliente',
    }) as Record<string, unknown>
    expect(r.loginPrefeitura).toBe('[REDACTED]')
    expect(r.senhaWebPrefeitura).toBe('[REDACTED]')
    expect(r.credenciaisPreenchidas).toEqual(['loginPrefeitura', 'senhaWebPrefeitura'])
    expect(r.razaoSocial).toBe('Cliente')
  })
})

describe('ator e origem do log dos callables', () => {
  const request = {
    auth: { uid: 'u1', token: { email: 'ana@escritorio.com', name: 'Ana' } },
    rawRequest: { ip: '200.1.2.3', headers: { 'user-agent': 'Mozilla/5.0 Teste' } },
  }

  it('nome e e-mail vêm do token, não do perfil editável', () => {
    expect(atorDaRequisicao(request)).toEqual({ id: 'u1', nome: 'Ana', email: 'ana@escritorio.com' })
    expect(atorDaRequisicao({ auth: { uid: 'u2', token: { email: 'b@x.com' } } })).toEqual({ id: 'u2', nome: 'b@x.com', email: 'b@x.com' })
  })

  it('grava IP e user-agent no log', () => {
    const log = montarAuditLog({
      tenantId: 't',
      actor: atorDaRequisicao(request),
      requisicao: requisicaoDoCallable(request),
      entidade: 'clientes_credenciais',
      entidadeId: 'c1',
      acao: 'credenciais_reveladas',
      origem: 'cloud_function',
    })
    expect(log).toMatchObject({ ip: '200.1.2.3', userAgent: 'Mozilla/5.0 Teste', usuarioNome: 'Ana', usuarioEmail: 'ana@escritorio.com' })
    expect(requisicaoDoCallable({})).toEqual({ ip: null, userAgent: null })
  })
})

describe('auditoria por trigger', () => {
  it('classifica create/update/delete/soft_delete e ignora só carimbos', () => {
    expect(classificarEscrita(null, { a: 1 })).toEqual({ acao: 'create', campos: ['a'] })
    expect(classificarEscrita({ a: 1 }, null)).toEqual({ acao: 'delete', campos: ['a'] })
    expect(classificarEscrita({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ acao: 'update', campos: ['b'] })
    expect(classificarEscrita({ status: 'ativo' }, { status: 'inativo', deletedAt: 'x' })?.acao).toBe('soft_delete')
    expect(classificarEscrita({ a: 1, ultimoAcesso: 1 }, { a: 1, ultimoAcesso: 2 })).toBeNull()
    expect(classificarEscrita({ a: 1, atualizadoEm: 1, credenciaisPreenchidas: [] }, { a: 1, atualizadoEm: 2, credenciaisPreenchidas: ['x'] })).toBeNull()
  })

  it('compara timestamps pelo instante e objetos sem depender da ordem das chaves', () => {
    const ts = (ms: number) => ({ toMillis: () => ms })
    expect(camposAlterados({ t: ts(1), o: { a: 1, b: 2 } }, { t: ts(1), o: { b: 2, a: 1 } })).toEqual([])
    expect(camposAlterados({ t: ts(1) }, { t: ts(2) })).toEqual(['t'])
  })

  it('senhas de portal: o log leva só os NOMES dos campos, nunca o valor (nem cifrado)', () => {
    const d = dadosParaLog('clientes_credenciais', { tenantId: 't', clienteId: 'c', senhaWebPrefeitura: 'iv:tag:cifra', loginPrefeitura: '' }, camposPreenchidos)
    expect(d).toEqual({ camposPreenchidos: ['senhaWebPrefeitura'], tenantId: 't', clienteId: 'c' })
    expect(JSON.stringify(d)).not.toContain('iv:tag:cifra')
  })

  it('ator do evento: uid de usuário final × conta de serviço', () => {
    expect(atorDoEvento('app_user', 'uid123')).toEqual({ tipo: 'usuario', id: 'uid123' })
    expect(atorDoEvento('unknown', 'uid123')).toEqual({ tipo: 'usuario', id: 'uid123' })
    expect(atorDoEvento('service_account', 'proj@appspot.gserviceaccount.com')).toMatchObject({ tipo: 'sistema' })
    expect(atorDoEvento('system', undefined)).toMatchObject({ tipo: 'sistema', id: 'system' })
  })
})
