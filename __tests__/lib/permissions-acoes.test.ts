import { describe, expect, it } from 'vitest'
import type { UserSession } from '@/lib/auth-client'
import {
  podeAbrirRota,
  podeEscreverEm,
  podeOperarNfse,
  rotuloPerfil,
  telaDaRota,
} from '@/lib/permissions'
import { ehPermissaoNegada } from '@/lib/error-message'
import { PERFIS_FECHAMENTO } from '../../functions/src/usuarios/perfis'

const sessao = (perfil: string, telas?: string[]): UserSession => ({
  uid: perfil, email: `${perfil}@demo.local`, nome: perfil, perfil, tenantId: 't', telas,
})

const admin = sessao('admin')
const fiscal = sessao('fiscal')
const financeiro = sessao('financeiro')
const operacional = sessao('operacional')
const leitura = sessao('leitura')

describe('podeOperarNfse — quem emite, cancela, consulta e prepara rascunhos', () => {
  it('só admin e fiscal (espelha functions/src/nfse e isFiscal() das regras)', () => {
    expect(podeOperarNfse(admin)).toBe(true)
    expect(podeOperarNfse(fiscal)).toBe(true)
    // Financeiro tem a tela NFS-e para LER as notas, mas não emite.
    expect(podeOperarNfse(financeiro)).toBe(false)
    expect(podeOperarNfse(operacional)).toBe(false)
    expect(podeOperarNfse(leitura)).toBe(false)
    expect(podeOperarNfse(null)).toBe(false)
  })

  it('tela fiscal concedida por override não dá emissão a quem não é fiscal', () => {
    expect(podeOperarNfse(sessao('operacional', ['fiscal']))).toBe(false)
  })
})

describe('podeEscreverEm — criação por módulo (allow create das regras)', () => {
  it('clientes: admin e operacional', () => {
    expect(podeEscreverEm(admin, 'clientes')).toBe(true)
    expect(podeEscreverEm(operacional, 'clientes')).toBe(true)
    expect(podeEscreverEm(fiscal, 'clientes')).toBe(false)
    expect(podeEscreverEm(leitura, 'clientes')).toBe(false)
  })

  it('tarefas/competências: equipe contábil, e só com a tela', () => {
    expect(podeEscreverEm(fiscal, 'tarefas')).toBe(true)
    expect(podeEscreverEm(financeiro, 'tarefas')).toBe(false)
    // Perfil certo, mas a tela foi retirada do usuário.
    expect(podeEscreverEm(sessao('operacional', ['hoje', 'clientes']), 'tarefas')).toBe(false)
  })

  it('financeiro: admin e financeiro', () => {
    expect(podeEscreverEm(financeiro, 'financeiro')).toBe(true)
    expect(podeEscreverEm(operacional, 'financeiro')).toBe(false)
  })

  it('fechamento: equipe contábil (o fiscal também gera — mesmo conjunto do callable)', () => {
    expect(podeEscreverEm(admin, 'fechamento')).toBe(true)
    expect(podeEscreverEm(operacional, 'fechamento')).toBe(true)
    expect(podeEscreverEm(fiscal, 'fechamento')).toBe(true)
    expect(podeEscreverEm(sessao('financeiro', ['hoje', 'fechamento']), 'fechamento')).toBe(false)
    expect([...PERFIS_FECHAMENTO].sort()).toEqual(['admin', 'fiscal', 'operacional'])
  })
})

describe('telaDaRota / podeAbrirRota — links do Painel, do Hoje e menus', () => {
  it('telaDaRota aceita query e reconhece as telas do AuthGuard', () => {
    expect(telaDaRota('/financeiro?status=pendente')).toBe('financeiro')
    expect(telaDaRota('/relatorios/carteira')).toBe('financeiro')
    expect(telaDaRota('/admin/servicos')).toBe('servicos')
    expect(telaDaRota('/fiscal/abc')).toBe('fiscal')
    expect(telaDaRota('/login')).toBeNull()
  })

  it('sem a tela, o link não é oferecido', () => {
    expect(podeAbrirRota(leitura, '/financeiro?status=atrasado')).toBe(false)
    expect(podeAbrirRota(operacional, '/fiscal')).toBe(false)
    expect(podeAbrirRota(leitura, '/clientes?status=ativo')).toBe(true)
  })

  it('criação/edição exige escrita no módulo', () => {
    expect(podeAbrirRota(leitura, '/clientes/novo')).toBe(false)
    expect(podeAbrirRota(leitura, '/clientes/abc/editar')).toBe(false)
    expect(podeAbrirRota(operacional, '/clientes/novo')).toBe(true)
    expect(podeAbrirRota(fiscal, '/competencias/nova?clienteId=x')).toBe(true)
    expect(podeAbrirRota(financeiro, '/financeiro/novo')).toBe(true)
  })

  it('abrir a emissão (/fiscal?emitir=1) exige quem emite', () => {
    expect(podeAbrirRota(financeiro, '/fiscal')).toBe(true)
    expect(podeAbrirRota(financeiro, '/fiscal?emitir=1&clienteId=x')).toBe(false)
    expect(podeAbrirRota(fiscal, '/fiscal?emitir=1')).toBe(true)
  })

  it('sem sessão, nada abre', () => {
    expect(podeAbrirRota(null, '/hoje')).toBe(false)
  })
})

describe('rotuloPerfil', () => {
  it('mostra o rótulo, não a chave crua', () => {
    expect(rotuloPerfil('leitura')).toBe('Somente Leitura')
    expect(rotuloPerfil('admin')).toBe('Administrador')
    expect(rotuloPerfil(undefined)).toBe('')
  })
})

describe('ehPermissaoNegada', () => {
  it('reconhece o código do Firestore e o das functions', () => {
    expect(ehPermissaoNegada({ code: 'permission-denied' })).toBe(true)
    expect(ehPermissaoNegada({ code: 'functions/permission-denied' })).toBe(true)
    expect(ehPermissaoNegada({ code: 'unavailable' })).toBe(false)
    expect(ehPermissaoNegada(new Error('x'))).toBe(false)
    expect(ehPermissaoNegada(null)).toBe(false)
  })
})
