// @vitest-environment node
/**
 * O catálogo da pré-validação (functions/src/nfse/pre-validacao/catalogos.json)
 * é uma cópia condensada das tabelas de src/lib/nfse-dominios — as functions
 * só publicam o que está em functions/. Se alguém atualizar as tabelas e
 * esquecer de regenerar, este teste falha: `node scripts/catalogo-pre-validacao.mjs`.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SAIDA, montarCatalogo, serializar } from '../../scripts/catalogo-pre-validacao.mjs'
import correlacao from '@/lib/nfse-dominios/correlacao-item-nbs.json'
import nbs from '@/lib/nfse-dominios/nbs.json'
import servicos from '@/lib/nfse-dominios/servicos-nacionais.json'

describe('catálogo da pré-validação', () => {
  it('está em dia com src/lib/nfse-dominios', () => {
    expect(fs.readFileSync(SAIDA, 'utf8')).toBe(serializar(montarCatalogo()))
  })

  it('correlação item × NBS (Anexo VIII) só aponta para NBS e itens que existem', () => {
    const nbsValidas = new Set((nbs as { codigo: string }[]).map((n) => n.codigo.replace(/\D/g, '')))
    // Chave = item da LC 116 (4 dígitos) ou, no grupo 99 (códigos novos da
    // Reforma, fora da lista do Anexo B), o código completo (6).
    const itens = new Set((servicos as { codigo: string }[]).flatMap((s) => [s.codigo.slice(0, 4), s.codigo]))
    const itensCorrelacao = Object.keys((correlacao as { itens: Record<string, string[]> }).itens)
    expect(itensCorrelacao.length).toBeGreaterThan(150)
    for (const [item, lista] of Object.entries((correlacao as { itens: Record<string, string[]> }).itens)) {
      expect(itens.has(item) || /^99\d{4}$/.test(item), `item ${item}`).toBe(true)
      for (const n of lista) expect(nbsValidas.has(n), `NBS ${n} do item ${item}`).toBe(true)
    }
  })
})
