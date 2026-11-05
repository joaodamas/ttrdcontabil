import { describe, expect, it } from 'vitest'
import {
  CAMPOS_CREDENCIAL_LISTA,
  credenciaisPreenchidasDe,
  juntarCredenciais,
  separarCredenciais,
} from '@/lib/clientes-credenciais'
import { CAMPOS_CREDENCIAL } from '@/lib/clientes-import'
import { montarFichaCliente } from '@/lib/cliente-ficha'
import { montarRelatorioClientes } from '@/lib/clientes-relatorio'
import { readFileSync } from 'node:fs'

describe('senhas de portal fora de `clientes`', () => {
  it('a lista é a mesma no front, nas regras e no script de migração', () => {
    expect([...CAMPOS_CREDENCIAL]).toEqual([...CAMPOS_CREDENCIAL_LISTA])
    const regras = readFileSync('firestore.rules', 'utf8')
    const script = readFileSync('scripts/migrar-credenciais-clientes.mjs', 'utf8')
    for (const k of CAMPOS_CREDENCIAL_LISTA) {
      expect(regras).toContain(`'${k}'`)
      expect(script).toContain(`'${k}'`)
    }
  })

  it('separarCredenciais tira toda credencial do payload do cliente', () => {
    const { dados, credenciais, temCredencial } = separarCredenciais({
      razaoSocial: 'X', senhaWebPrefeitura: 'abc', loginPrefeitura: '', responsavelSenhaMeuGov: undefined,
    })
    expect(dados).toEqual({ razaoSocial: 'X' })
    expect(credenciais).toEqual({ senhaWebPrefeitura: 'abc', loginPrefeitura: '', responsavelSenhaMeuGov: '' })
    expect(temCredencial).toBe(true)
    expect(separarCredenciais({ razaoSocial: 'Y' }).temCredencial).toBe(false)
  })

  it('preenchidas: lista do trigger + legado em texto puro, sem duplicar', () => {
    expect(credenciaisPreenchidasDe({ credenciaisPreenchidas: ['senhaPostoFiscal', 'campoEstranho'], senhaWebPrefeitura: 'x' }))
      .toEqual(['senhaWebPrefeitura', 'senhaPostoFiscal'])
    expect(credenciaisPreenchidasDe({ senhaWebPrefeitura: '  ' })).toEqual([])
  })

  it('juntarCredenciais: o doc novo vence o legado campo a campo, vazio apaga', () => {
    expect(juntarCredenciais(
      { senhaWebPrefeitura: 'velha', loginPrefeitura: 'login', senhaPostoFiscal: 'p' },
      { senhaWebPrefeitura: 'nova', senhaPostoFiscal: '' },
    )).toEqual({ senhaWebPrefeitura: 'nova', loginPrefeitura: 'login' })
  })

  it('ficha sem as senhas mostra preenchida/em branco e nenhum valor', () => {
    const cliente = { razaoSocial: 'A', credenciaisPreenchidas: ['responsavelSenhaMeuGov'] }
    const campo = (f: ReturnType<typeof montarFichaCliente>) =>
      f.secoes.flatMap((s) => s.campos).find((c) => c.key === 'responsavelSenhaMeuGov')!
    const semSenhas = montarFichaCliente(cliente)
    expect(campo(semSenhas)).toMatchObject({ preenchido: true, valor: '' })
    const comSenhas = montarFichaCliente(cliente, { responsavelSenhaMeuGov: 'Gov#1' })
    expect(campo(comSenhas)).toMatchObject({ preenchido: true, valor: 'Gov#1' })
  })

  it('relatório: status pela lista; com senhas, valor do doc de credenciais', () => {
    const cliente = { id: 'a', status: 'ativo', razaoSocial: 'A', cpfCnpj: '33854681000104', credenciaisPreenchidas: ['senhaWebPrefeitura'] }
    const comum = montarRelatorioClientes({ clientes: [cliente], fiscais: [] })
    const cab = comum.clientes[0]
    const col = cab.indexOf('Credencial — Senha WEB Prefeitura')
    expect(comum.clientes[1][col]).toBe('✔ preenchida')
    const comSenha = montarRelatorioClientes({
      clientes: [cliente], fiscais: [], incluirSenhas: true,
      credenciais: new Map([['a', { senhaWebPrefeitura: 'Pref#9' }]]),
    })
    expect(comSenha.clientes[1][col]).toBe('Pref#9')
  })
})
