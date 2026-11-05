import { describe, expect, it } from 'vitest'
import { decodificarResposta } from '../../functions/src/nfse/xml/soap'

const latin1 = (s: string) => Buffer.from(s, 'latin1')

describe('decodificarResposta — acentos das mensagens da prefeitura', () => {
  it('usa o charset do cabeçalho (ISO-8859-1)', () => {
    expect(decodificarResposta(latin1('Usuário não liberado'), 'text/xml; charset=ISO-8859-1')).toBe('Usuário não liberado')
  })

  it('usa o encoding da declaração XML quando o cabeçalho não diz', () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><Msg>Usuário não liberado</Msg>'
    expect(decodificarResposta(latin1(xml), 'text/xml')).toContain('Usuário não liberado')
  })

  it('UTF-8 continua funcionando', () => {
    expect(decodificarResposta(Buffer.from('Emissão concluída', 'utf8'), 'text/xml; charset=utf-8')).toBe('Emissão concluída')
  })

  it('sem nenhuma pista e bytes inválidos em UTF-8, cai para latin1 em vez de "�"', () => {
    expect(decodificarResposta(latin1('Usuário não liberado'), undefined)).toBe('Usuário não liberado')
  })
})
