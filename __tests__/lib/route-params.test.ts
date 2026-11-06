import { afterEach, describe, expect, it } from 'vitest'
import { getPathSegmentAfter } from '@/lib/route-params'

/*
 * No static export, /tarefas/<id> é servido pelo rewrite do firebase.json com a
 * página gerada para o id "placeholder": usePathname()/useParams() devolvem
 * "placeholder". getPathSegmentAfter lê a URL real do navegador
 * (window.location) — é o que faz o detalhe abrir em produção.
 */
describe('getPathSegmentAfter', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it.each([
    ['/tarefas/abc123', 'tarefas', 'abc123'],
    ['/tarefas/abc123/editar', 'tarefas', 'abc123'],
    ['/competencias/comp-1', 'competencias', 'comp-1'],
    ['/competencias/comp-1/editar', 'competencias', 'comp-1'],
    ['/fiscal/nota-9', 'fiscal', 'nota-9'],
    ['/ir/decl-2025', 'ir', 'decl-2025'],
    ['/ir/decl-2025/editar', 'ir', 'decl-2025'],
    ['/clientes/cli-1/tomadores', 'clientes', 'cli-1'],
  ])('%s → id depois de "%s"', (url, area, esperado) => {
    window.history.replaceState(null, '', url)
    // O pathname do Next no build estático é o do placeholder; vale a URL real.
    expect(getPathSegmentAfter(`/${area}/placeholder`, area)).toBe(esperado)
  })

  it('ignora query string e decodifica o segmento', () => {
    window.history.replaceState(null, '', '/tarefas/a%20b?aba=comentarios')
    expect(getPathSegmentAfter('/tarefas/placeholder', 'tarefas')).toBe('a b')
  })

  it('devolve vazio quando a área não está na URL ou não tem id', () => {
    window.history.replaceState(null, '', '/tarefas')
    expect(getPathSegmentAfter('/tarefas', 'tarefas')).toBe('')
    window.history.replaceState(null, '', '/hoje')
    expect(getPathSegmentAfter('/hoje', 'fiscal')).toBe('')
  })
})
