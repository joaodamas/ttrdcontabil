import { describe, expect, it } from 'vitest'
import { getErrorMessage, isTechnicalErrorMessage } from '@/lib/error-message'

const FALLBACK = 'Não foi possível carregar.'

describe('getErrorMessage', () => {
  it('não repassa o código técnico de Cloud Functions ("internal [0]")', () => {
    const err = Object.assign(new Error('internal [0]'), { code: 'functions/internal' })
    expect(getErrorMessage(err, FALLBACK)).toBe('Erro interno no servidor. Tente novamente em instantes.')
  })

  it('mensagem igual ao código vira tradução amigável', () => {
    const err = Object.assign(new Error('internal'), { code: 'functions/internal' })
    expect(getErrorMessage(err, FALLBACK)).not.toBe('internal')
  })

  it('mantém mensagens explicativas vindas do backend', () => {
    const err = Object.assign(new Error('Certificado vencido em 10/10/2026.'), { code: 'functions/failed-precondition' })
    expect(getErrorMessage(err, FALLBACK)).toBe('Certificado vencido em 10/10/2026.')
  })

  it('Error sem código e com mensagem técnica usa o fallback', () => {
    expect(getErrorMessage(new Error('INTERNAL [0]'), FALLBACK)).toBe(FALLBACK)
    expect(getErrorMessage(new Error('Falha ao salvar o cliente.'), FALLBACK)).toBe('Falha ao salvar o cliente.')
  })

  it('códigos do Firestore continuam traduzidos', () => {
    expect(getErrorMessage({ code: 'permission-denied' }, FALLBACK)).toBe('Você não tem permissão para esta ação.')
  })
})

describe('isTechnicalErrorMessage', () => {
  it('reconhece códigos e dumps do SDK', () => {
    expect(isTechnicalErrorMessage('internal')).toBe(true)
    expect(isTechnicalErrorMessage('UNAVAILABLE [14]')).toBe(true)
    expect(isTechnicalErrorMessage('FirebaseError: Missing or insufficient permissions.')).toBe(true)
    expect(isTechnicalErrorMessage('Cliente sem CNPJ cadastrado.')).toBe(false)
  })
})
