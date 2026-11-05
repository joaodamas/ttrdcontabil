import { describe, expect, it } from 'vitest'
import { nomePreservado } from '@/lib/nome-preservado'

describe('nomePreservado — editar registro de cliente inativo não apaga o nome', () => {
  it('usa o nome encontrado na lista', () => {
    expect(nomePreservado('c1', 'ACME', { id: 'c1', nome: 'Antigo' })).toBe('ACME')
  })
  it('mantém o nome gravado quando o id não mudou e a lista não o traz', () => {
    expect(nomePreservado('c1', undefined, { id: 'c1', nome: 'Inativa Ltda' })).toBe('Inativa Ltda')
  })
  it('id trocado para um que a lista não tem: não herda o nome antigo', () => {
    expect(nomePreservado('c2', undefined, { id: 'c1', nome: 'Inativa Ltda' })).toBeNull()
  })
  it('sem id, sem nome', () => {
    expect(nomePreservado(null, 'ACME')).toBeNull()
  })
})
