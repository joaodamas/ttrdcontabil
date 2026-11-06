// @vitest-environment node
// scripts/configurar-alertas.sh lista as functions pelo nome; este teste
// garante que os nomes existem e que toda onSchedule publicada tem alerta.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../..')
const script = readFileSync(path.join(RAIZ, 'scripts/configurar-alertas.sh'), 'utf8')
const index = readFileSync(path.join(RAIZ, 'functions/src/index.ts'), 'utf8')

function listaDoScript(nome: string): string[] {
  const m = script.match(new RegExp(`^${nome}=\\(([^)]*)\\)`, 'm'))
  expect(m, `lista ${nome} no script`).toBeTruthy()
  return m![1].split(/\s+/).filter(Boolean)
}

/** Nomes exportados por functions/src/index.ts (ignora linhas comentadas). */
function exportadas(): Set<string> {
  const semComentario = index.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  const nomes = new Set<string>()
  for (const bloco of semComentario.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const n of bloco[1].split(',')) if (n.trim()) nomes.add(n.trim())
  }
  return nomes
}

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    return statSync(p).isDirectory() ? arquivosTs(p) : p.endsWith('.ts') ? [p] : []
  })
}

function agendadasNoCodigo(): Set<string> {
  const nomes = new Set<string>()
  for (const arq of arquivosTs(path.join(RAIZ, 'functions/src'))) {
    for (const m of readFileSync(arq, 'utf8').matchAll(/export const (\w+) = onSchedule\(/g)) nomes.add(m[1])
  }
  return nomes
}

describe('scripts/configurar-alertas.sh', () => {
  const publicadas = exportadas()

  it('toda função agendada publicada tem alerta de falha', () => {
    const doScript = new Set(listaDoScript('AGENDADAS'))
    const publicadasAgendadas = [...agendadasNoCodigo()].filter((n) => publicadas.has(n))
    expect(publicadasAgendadas.length).toBeGreaterThan(5)
    for (const n of publicadasAgendadas) expect(doScript.has(n), n).toBe(true)
    for (const n of doScript) expect(publicadasAgendadas, n).toContain(n)
  })

  it('functions de NFS-e do alerta existem e estão publicadas', () => {
    const nfse = listaDoScript('NFSE_FUNCTIONS')
    expect(nfse).toContain('emitirNfse')
    expect(nfse).toContain('reconciliarNfsePendentes')
    for (const n of nfse) expect(publicadas.has(n), n).toBe(true)
  })

  it('dry-run é o padrão', () => {
    expect(script).toMatch(/^APLICAR=0$/m)
    expect(script).toContain('if [[ $APLICAR -eq 1 ]]; then "$@"; fi')
  })
})
