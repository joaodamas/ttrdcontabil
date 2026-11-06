import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { deslocarMes, hrefComFiltro, hrefSemFiltro, inteiroDaUrl } from '@/lib/url-filtros'
import { ROTAS_CONHECIDAS, rotaConhecida } from '@/lib/rotas-conhecidas'
import { deveIgnorarClique } from '@/components/ui/linha-clicavel'
import { BLOQUEIO_FISCAL, destinoBloqueio } from '@/lib/fiscal-bloqueios'
import { STATUS_COM_ERRO, hrefHistorico, rotuloStatusFiltro, statusDaUrl } from '@/features/fiscal/historico-filtros'

describe('url-filtros', () => {
  it('hrefSemFiltro remove a chave e a página', () => {
    expect(hrefSemFiltro('/tarefas', 'clienteId=c1&status=pendente&page=3', 'clienteId')).toBe('/tarefas?status=pendente')
    expect(hrefSemFiltro('/tarefas', new URLSearchParams('clienteId=c1'), ['clienteId'])).toBe('/tarefas')
  })

  it('hrefComFiltro troca, remove com "" e volta para a página 1', () => {
    expect(hrefComFiltro('/competencias', 'mes=3&ano=2026&clienteId=c1&page=2', { mes: '', ano: '' })).toBe('/competencias?clienteId=c1')
    expect(hrefComFiltro('/competencias', 'mes=3&ano=2026', { mes: 4, page: 1 })).toBe('/competencias?mes=4&ano=2026&page=1')
  })

  it('deslocarMes atravessa o ano', () => {
    expect(deslocarMes(1, 2026, -1)).toEqual({ mes: 12, ano: 2025 })
    expect(deslocarMes(12, 2026, 1)).toEqual({ mes: 1, ano: 2027 })
    expect(deslocarMes(6, 2026, 0)).toEqual({ mes: 6, ano: 2026 })
  })

  it('inteiroDaUrl: ausente/vazio/inválido = null', () => {
    expect(inteiroDaUrl(null)).toBeNull()
    expect(inteiroDaUrl('')).toBeNull()
    expect(inteiroDaUrl('abc')).toBeNull()
    expect(inteiroDaUrl('7')).toBe(7)
  })
})

describe('rotas conhecidas (página não encontrada)', () => {
  // Cada page.tsx de src/app vira uma rota; grupos "(x)" somem e "[id]" = ":id".
  function rotasDoSistemaDeArquivos(dir: string, base = ''): string[] {
    const rotas: string[] = []
    for (const nome of readdirSync(dir)) {
      const cheio = path.join(dir, nome)
      if (statSync(cheio).isDirectory()) {
        const seg = /^\(.*\)$/.test(nome) ? '' : nome.startsWith('[') ? ':id' : nome
        rotas.push(...rotasDoSistemaDeArquivos(cheio, seg ? `${base}/${seg}` : base))
      } else if (nome === 'page.tsx') {
        rotas.push(base || '/')
      }
    }
    return rotas
  }

  it('a lista bate com as páginas do app', () => {
    const doDisco = [...new Set(rotasDoSistemaDeArquivos(path.resolve(__dirname, '../../src/app')))].sort()
    expect([...ROTAS_CONHECIDAS].sort()).toEqual(doDisco)
  })

  it('reconhece telas, ids e .html; recusa o resto', () => {
    expect(rotaConhecida('/hoje')).toBe(true)
    expect(rotaConhecida('/hoje/')).toBe(true)
    expect(rotaConhecida('/dashboard.html')).toBe(true)
    expect(rotaConhecida('/tarefas/tar-1')).toBe(true)
    expect(rotaConhecida('/clientes/cli-01/tomadores/importar')).toBe(true)
    expect(rotaConhecida('/fiscal/historico?mes=3')).toBe(true)
    expect(rotaConhecida('/pagina-que-nao-existe')).toBe(false)
    expect(rotaConhecida('/clientes/cli-01/qualquer')).toBe(false)
    expect(rotaConhecida('/tarefas/tar-1/editar/extra')).toBe(false)
  })
})

describe('linha clicável: o que não abre a linha', () => {
  function montar() {
    document.body.innerHTML = `
      <table><tbody><tr id="linha"><td id="celula"><span id="texto">Nome</span></td>
      <td><button id="botao"><svg id="icone"></svg></button></td>
      <td data-parar-linha=""><span id="parado">x</span></td></tr></tbody></table>
      <div id="portal"><div role="menuitem" id="item">Excluir</div></div>`
    const linha = document.getElementById('linha')!
    return { linha, el: (id: string) => document.getElementById(id)! }
  }

  it('clique em texto/célula abre', () => {
    const { linha, el } = montar()
    expect(deveIgnorarClique({ target: el('texto'), currentTarget: linha })).toBe(false)
    expect(deveIgnorarClique({ target: el('celula'), currentTarget: linha })).toBe(false)
  })

  it('botão (e ícone dentro dele) e data-parar-linha não abrem', () => {
    const { linha, el } = montar()
    expect(deveIgnorarClique({ target: el('botao'), currentTarget: linha })).toBe(true)
    expect(deveIgnorarClique({ target: el('icone'), currentTarget: linha })).toBe(true)
    expect(deveIgnorarClique({ target: el('parado'), currentTarget: linha })).toBe(true)
  })

  it('evento vindo de portal (menu ⋯, diálogo) não abre', () => {
    const { linha, el } = montar()
    expect(deveIgnorarClique({ target: el('item'), currentTarget: linha })).toBe(true)
  })
})

describe('prontidão fiscal: onde corrigir cada bloqueio', () => {
  it('serviço e dia de emissão → cadastro; o resto → configuração fiscal', () => {
    expect(destinoBloqueio(BLOQUEIO_FISCAL.semServicoAtivo, 'c1')).toBe('/clientes/c1')
    expect(destinoBloqueio(BLOQUEIO_FISCAL.diaEmissaoAusente, 'c1')).toBe('/clientes/c1')
    expect(destinoBloqueio(BLOQUEIO_FISCAL.certificadoA1, 'c1')).toBe('/clientes/c1/fiscal')
    expect(destinoBloqueio(BLOQUEIO_FISCAL.municipioAusente, 'c1')).toBe('/clientes/c1/fiscal')
  })
})

describe('filtros do histórico de NFS-e', () => {
  it('status em lista vira where-in; rótulos legíveis', () => {
    expect(statusDaUrl(STATUS_COM_ERRO)).toEqual(['rejeitada', 'erro_integracao'])
    expect(statusDaUrl('')).toEqual([])
    expect(rotuloStatusFiltro(STATUS_COM_ERRO)).toBe('Com erro ou rejeição')
  })

  it('hrefHistorico monta o link dos KPIs', () => {
    expect(hrefHistorico({ status: 'emitida', mes: 11, ano: 2026 })).toBe('/fiscal/historico?status=emitida&mes=11&ano=2026')
    expect(hrefHistorico({})).toBe('/fiscal/historico')
  })
})
