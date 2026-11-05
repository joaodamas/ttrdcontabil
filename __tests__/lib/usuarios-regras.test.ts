// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  ErroRegraUsuario,
  MSG_ULTIMO_ADMIN,
  camposAlterados,
  deixariaSemAdmin,
  normalizarEmail,
  resumoParaAuditoria,
  validarEntradaAtualizar,
  validarEntradaCriar,
  validarTelas,
  validarUid,
  verificarMudanca,
} from '../../functions/src/usuarios/regras'
import { PERFIL_DEFAULT_TELAS, TELAS, podeLerNfse } from '../../functions/src/usuarios/perfis'
import { projecaoDiretorio } from '../../functions/src/usuarios/diretorio'
import { canAccessTela } from '@/lib/permissions'

function erroDe(fn: () => unknown) {
  try {
    fn()
  } catch (err) {
    return err as ErroRegraUsuario
  }
  throw new Error('esperava erro')
}

describe('validação da entrada de criarUsuario', () => {
  it('normaliza e-mail e nome, ordena e deduplica telas', () => {
    const e = validarEntradaCriar({
      nome: '  Maria   da Silva ',
      email: ' Maria@Escritorio.COM.br ',
      perfil: 'fiscal',
      telas: ['fiscal', 'hoje', 'fiscal'],
    })
    expect(e).toEqual({ nome: 'Maria da Silva', email: 'maria@escritorio.com.br', perfil: 'fiscal', telas: ['hoje', 'fiscal'] })
  })

  it('recusa e-mail inválido, perfil fora dos 5 e tela desconhecida', () => {
    expect(() => normalizarEmail('sem-arroba')).toThrow('E-mail inválido')
    expect(() => normalizarEmail('a@b')).toThrow('E-mail inválido')
    expect(erroDe(() => validarEntradaCriar({ nome: 'Ana', email: 'a@b.com', perfil: 'superadmin', telas: [] })).codigo)
      .toBe('invalid-argument')
    expect(() => validarTelas(['hoje', 'root'])).toThrow('Tela desconhecida: root')
    expect(() => validarTelas('hoje')).toThrow('lista')
  })

  it('telas ausentes viram lista vazia (= padrão do perfil)', () => {
    expect(validarEntradaCriar({ nome: 'Ana', email: 'a@b.com', perfil: 'leitura' }).telas).toEqual([])
  })

  it('uid não pode ser vazio nem ter barra', () => {
    expect(() => validarUid('')).toThrow()
    expect(() => validarUid('a/b')).toThrow()
    expect(validarUid(' abc ')).toBe('abc')
  })
})

describe('validação da entrada de atualizarUsuario', () => {
  it('só leva os campos enviados', () => {
    expect(validarEntradaAtualizar({ uid: 'u1', ativo: false })).toEqual({ uid: 'u1', alteracoes: { ativo: false } })
  })

  it('nada para alterar, ativo não booleano e tela inválida são recusados', () => {
    expect(() => validarEntradaAtualizar({ uid: 'u1' })).toThrow('Nada para alterar')
    expect(() => validarEntradaAtualizar({ uid: 'u1', ativo: 'sim' })).toThrow('Status inválido')
    expect(() => validarEntradaAtualizar({ uid: 'u1', telas: ['xpto'] })).toThrow('Tela desconhecida')
  })

  it('ignora e-mail e tenant mesmo se enviados', () => {
    const { alteracoes } = validarEntradaAtualizar({ uid: 'u1', nome: 'Novo', email: 'x@y.com', tenantId: 'outro' })
    expect(alteracoes).toEqual({ nome: 'Novo' })
  })

  it('camposAlterados ignora o que já era igual', () => {
    expect(camposAlterados({ perfil: 'fiscal', telas: ['hoje'] }, { perfil: 'fiscal', telas: ['hoje', 'ir'] })).toEqual(['telas'])
  })
})

describe('trava do último administrador', () => {
  const admins = [
    { uid: 'a1', perfil: 'admin', ativo: true },
    { uid: 'a2', perfil: 'admin', ativo: false },
  ]

  it('rebaixar, desativar ou excluir o único admin ativo deixaria o escritório sem admin', () => {
    expect(deixariaSemAdmin(admins, 'a1', { perfil: 'fiscal', ativo: true })).toBe(true)
    expect(deixariaSemAdmin(admins, 'a1', { perfil: 'admin', ativo: false })).toBe(true)
    expect(deixariaSemAdmin(admins, 'a1', null)).toBe(true)
  })

  it('com outro admin ativo pode; admin inativo não conta', () => {
    const dois = [...admins, { uid: 'a3', perfil: 'admin' }] // sem `ativo` = ativo
    expect(deixariaSemAdmin(dois, 'a1', { perfil: 'leitura', ativo: true })).toBe(false)
  })

  it('verificarMudanca: o próprio admin não se rebaixa sendo o único', () => {
    const err = erroDe(() => verificarMudanca({
      atorUid: 'a1', alvoUid: 'a1', antes: admins[0], depois: { perfil: 'operacional', ativo: true }, adminsDoTenant: admins,
    }))
    expect(err.codigo).toBe('failed-precondition')
    expect(err.message).toBe(MSG_ULTIMO_ADMIN)
  })

  it('verificarMudanca: ninguém se desativa nem se exclui, mesmo com outros admins', () => {
    const varios = [...admins, { uid: 'a3', perfil: 'admin', ativo: true }]
    expect(() => verificarMudanca({
      atorUid: 'a1', alvoUid: 'a1', antes: admins[0], depois: { perfil: 'admin', ativo: false }, adminsDoTenant: varios,
    })).toThrow('desativar o seu próprio')
    expect(() => verificarMudanca({
      atorUid: 'a1', alvoUid: 'a1', antes: admins[0], depois: null, adminsDoTenant: varios,
    })).toThrow('excluir o seu próprio')
  })

  it('verificarMudanca: mexer em quem não é admin ativo nunca esbarra na trava', () => {
    expect(() => verificarMudanca({
      atorUid: 'a1', alvoUid: 'u9', antes: { perfil: 'fiscal' }, depois: null, adminsDoTenant: admins,
    })).not.toThrow()
    expect(() => verificarMudanca({
      atorUid: 'a1', alvoUid: 'a2', antes: admins[1], depois: { perfil: 'leitura', ativo: false }, adminsDoTenant: admins,
    })).not.toThrow()
  })
})

describe('auditoria e diretório', () => {
  it('resumo de auditoria só leva campos de acesso', () => {
    expect(resumoParaAuditoria({ nome: 'A', email: 'a@b.com', perfil: 'admin', telas: [], ativo: true, tenantId: 't' }))
      .toEqual({ nome: 'A', perfil: 'admin', telas: [], ativo: true })
  })

  it('diretório público não expõe e-mail, perfil nem telas', () => {
    expect(projecaoDiretorio({ nome: ' Ana ', email: 'a@b.com', perfil: 'admin', telas: ['admin'], tenantId: 't' }))
      .toEqual({ nome: 'Ana', ativo: true, tenantId: 't' })
    expect(projecaoDiretorio({ ativo: false }).ativo).toBe(false)
  })
})

describe('fonte única de perfis e telas', () => {
  it('canAccessTela usa os padrões de functions/src/usuarios/perfis.ts', () => {
    const leitura = { uid: 'x', email: '', nome: '', perfil: 'leitura' }
    for (const tela of TELAS) {
      expect(canAccessTela(leitura, tela)).toBe(PERFIL_DEFAULT_TELAS.leitura.includes(tela))
    }
    expect(canAccessTela({ ...leitura, telas: ['ir'] }, 'ir')).toBe(true)
  })

  it('podeLerNfse espelha canReadNfse das regras', () => {
    expect(podeLerNfse({ perfil: 'financeiro' })).toBe(true)
    expect(podeLerNfse({ perfil: 'leitura' })).toBe(false)
    expect(podeLerNfse({ perfil: 'operacional', telas: ['fiscal'] })).toBe(true)
  })
})
