import { describe, expect, it } from 'vitest'
import {
  MOTIVO_INATIVO,
  MOTIVO_PERFIL_INVALIDO,
  MOTIVO_SEM_PERFIL,
  avaliarPerfil,
} from '@/lib/auth-client'

describe('avaliarPerfil — quem entra no sistema', () => {
  it('sem perfil não vira mais "leitura": é sem acesso', () => {
    expect(avaliarPerfil('u', 'a@b.com', null)).toEqual({ ok: false, motivo: MOTIVO_SEM_PERFIL })
  })

  it('inativo e perfil desconhecido/ausente ficam de fora', () => {
    expect(avaliarPerfil('u', 'a@b.com', { perfil: 'admin', ativo: false })).toEqual({ ok: false, motivo: MOTIVO_INATIVO })
    expect(avaliarPerfil('u', 'a@b.com', { perfil: 'superuser' })).toEqual({ ok: false, motivo: MOTIVO_PERFIL_INVALIDO })
    expect(avaliarPerfil('u', 'a@b.com', { nome: 'X' })).toEqual({ ok: false, motivo: MOTIVO_PERFIL_INVALIDO })
  })

  it('ativo (ou sem o campo `ativo`, perfil antigo) entra com perfil e telas', () => {
    const r = avaliarPerfil('u', 'a@b.com', { nome: 'Ana', perfil: 'fiscal', tenantId: 't', telas: ['hoje'] })
    expect(r).toEqual({ ok: true, usuario: { uid: 'u', email: 'a@b.com', nome: 'Ana', perfil: 'fiscal', tenantId: 't', telas: ['hoje'] } })
  })
})
