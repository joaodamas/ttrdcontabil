/**
 * Firestore EM MEMÓRIA para os testes de orquestração da emissão de NFS-e
 * (functions/src/nfse/*). Cobre só o que esses módulos usam: doc/collection,
 * get/set/update/add, where/orderBy/limit, transações, batch e getAll, mais
 * FieldValue.increment/serverTimestamp e Timestamp.
 *
 * Transações rodam UMA POR VEZ (fila): o resultado é o de uma execução
 * serializável — o mesmo que o Firestore real garante após os retries de
 * contenção. É o que importa para provar a trava do rascunho.
 */

export class TimestampFalso {
  constructor(private readonly ms: number) {}
  static now() { return new TimestampFalso(Date.now()) }
  static fromDate(d: Date) { return new TimestampFalso(d.getTime()) }
  static fromMillis(ms: number) { return new TimestampFalso(ms) }
  toMillis() { return this.ms }
  toDate() { return new Date(this.ms) }
  valueOf() { return this.ms }
}

class Incremento { constructor(readonly n: number) {} }
class ServerTimestamp {}

export const FieldValueFalso = {
  increment: (n: number) => new Incremento(n),
  serverTimestamp: () => new ServerTimestamp(),
}

type Dados = Record<string, unknown>

function clonar<T>(v: T): T {
  if (v instanceof TimestampFalso || v instanceof Buffer) return v
  if (Array.isArray(v)) return v.map(clonar) as unknown as T
  if (v && typeof v === 'object') {
    const o: Dados = {}
    for (const [k, x] of Object.entries(v as Dados)) o[k] = clonar(x)
    return o as T
  }
  return v
}

function resolverSentinela(atual: unknown, valor: unknown): unknown {
  if (valor instanceof Incremento) return (typeof atual === 'number' ? atual : 0) + valor.n
  if (valor instanceof ServerTimestamp) return TimestampFalso.now()
  if (valor === undefined) throw new Error('Firestore falso: valor undefined não é aceito (como no real).')
  return clonar(valor)
}

function setCaminho(obj: Dados, caminho: string, valor: unknown) {
  const partes = caminho.split('.')
  let alvo = obj
  for (const p of partes.slice(0, -1)) {
    if (!alvo[p] || typeof alvo[p] !== 'object') alvo[p] = {}
    alvo = alvo[p] as Dados
  }
  const ultima = partes[partes.length - 1]
  alvo[ultima] = resolverSentinela(alvo[ultima], valor)
}

function getCaminho(obj: Dados | undefined, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Dados)[p] : undefined), obj)
}

function mesclar(alvo: Dados, origem: Dados) {
  for (const [k, v] of Object.entries(origem)) {
    if (v && typeof v === 'object' && !(v instanceof TimestampFalso) && !(v instanceof Incremento) && !(v instanceof ServerTimestamp) && !Array.isArray(v)) {
      if (!alvo[k] || typeof alvo[k] !== 'object') alvo[k] = {}
      mesclar(alvo[k] as Dados, v as Dados)
    } else {
      alvo[k] = resolverSentinela(alvo[k], v)
    }
  }
}

function comparavel(v: unknown): unknown {
  return v instanceof TimestampFalso ? v.toMillis() : v
}

let contadorId = 0

export class SnapshotFalso {
  constructor(readonly ref: DocRefFalso, private readonly dados: Dados | undefined) {}
  get id() { return this.ref.id }
  get exists() { return this.dados !== undefined }
  data() { return this.dados === undefined ? undefined : clonar(this.dados) }
  get(campo: string) { return getCaminho(this.dados, campo) }
}

export class DocRefFalso {
  constructor(readonly db: FirestoreFalso, readonly colecao: string, readonly id: string) {}
  get path() { return `${this.colecao}/${this.id}` }
  async get() { return this.db.ler(this) }
  async set(dados: Dados, opcoes?: { merge?: boolean }) { this.db.gravar(this, dados, opcoes) }
  async update(dados: Dados) { this.db.atualizar(this, dados) }
  async delete() { this.db.docs.delete(this.path) }
}

type Filtro = { campo: string; op: string; valor: unknown }

export class QueryFalsa {
  constructor(
    readonly db: FirestoreFalso,
    readonly colecao: string,
    readonly filtros: Filtro[] = [],
    readonly ordem: { campo: string; dir: 'asc' | 'desc' } | null = null,
    readonly limite: number | null = null,
  ) {}
  where(campo: string, op: string, valor: unknown) {
    return new QueryFalsa(this.db, this.colecao, [...this.filtros, { campo, op, valor }], this.ordem, this.limite)
  }
  orderBy(campo: string, dir: 'asc' | 'desc' = 'asc') {
    return new QueryFalsa(this.db, this.colecao, this.filtros, { campo, dir }, this.limite)
  }
  limit(n: number) { return new QueryFalsa(this.db, this.colecao, this.filtros, this.ordem, n) }
  async get() { return this.db.consultar(this) }
}

export class ColecaoFalsa extends QueryFalsa {
  doc(id?: string) { return new DocRefFalso(this.db, this.colecao, id ?? `auto${++contadorId}`) }
  async add(dados: Dados) {
    const ref = this.doc()
    this.db.gravar(ref, dados)
    return ref
  }
}

export class FirestoreFalso {
  readonly docs = new Map<string, Dados>()
  private fila: Promise<unknown> = Promise.resolve()
  /** Ganchos para simular falhas/latência em testes. */
  aoGravar?: (ref: DocRefFalso, dados: Dados) => void

  collection(nome: string) { return new ColecaoFalsa(this, nome) }

  ler(ref: DocRefFalso) { return new SnapshotFalso(ref, this.docs.get(ref.path)) }

  gravar(ref: DocRefFalso, dados: Dados, opcoes?: { merge?: boolean }) {
    this.aoGravar?.(ref, dados)
    if (opcoes?.merge && this.docs.has(ref.path)) {
      const atual = clonar(this.docs.get(ref.path)!)
      mesclar(atual, dados)
      this.docs.set(ref.path, atual)
      return
    }
    const novo: Dados = {}
    mesclar(novo, dados)
    this.docs.set(ref.path, novo)
  }

  atualizar(ref: DocRefFalso, dados: Dados) {
    const atual = this.docs.get(ref.path)
    if (!atual) throw new Error(`NOT_FOUND: ${ref.path}`)
    this.aoGravar?.(ref, dados)
    const copia = clonar(atual)
    for (const [k, v] of Object.entries(dados)) setCaminho(copia, k, v)
    this.docs.set(ref.path, copia)
  }

  consultar(q: QueryFalsa) {
    let docs = [...this.docs.entries()]
      .filter(([p]) => p.startsWith(`${q.colecao}/`) && !p.slice(q.colecao.length + 1).includes('/'))
      .map(([p, d]) => new SnapshotFalso(new DocRefFalso(this, q.colecao, p.slice(q.colecao.length + 1)), d))
    for (const f of q.filtros) {
      docs = docs.filter((s) => {
        const v = comparavel(s.get(f.campo))
        const alvo = comparavel(f.valor)
        switch (f.op) {
          case '==': return v === alvo
          case '!=': return v !== alvo
          case 'in': return (f.valor as unknown[]).map(comparavel).includes(v)
          case '>=': return v !== undefined && (v as number) >= (alvo as number)
          case '>': return v !== undefined && (v as number) > (alvo as number)
          case '<=': return v !== undefined && (v as number) <= (alvo as number)
          case '<': return v !== undefined && (v as number) < (alvo as number)
          default: throw new Error(`op não suportada: ${f.op}`)
        }
      })
    }
    if (q.ordem) {
      const { campo, dir } = q.ordem
      docs.sort((a, b) => {
        const x = comparavel(a.get(campo)) as number
        const y = comparavel(b.get(campo)) as number
        return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1)
      })
    }
    if (q.limite !== null) docs = docs.slice(0, q.limite)
    return { empty: docs.length === 0, size: docs.length, docs }
  }

  async getAll(...refs: DocRefFalso[]) { return refs.map((r) => this.ler(r)) }

  batch() {
    const ops: Array<() => void> = []
    return {
      set: (ref: DocRefFalso, dados: Dados, opcoes?: { merge?: boolean }) => { ops.push(() => this.gravar(ref, dados, opcoes)) },
      update: (ref: DocRefFalso, dados: Dados) => { ops.push(() => this.atualizar(ref, dados)) },
      delete: (ref: DocRefFalso) => { ops.push(() => { this.docs.delete(ref.path) }) },
      commit: async () => { ops.forEach((op) => op()) },
    }
  }

  runTransaction<T>(fn: (tx: TransacaoFalsa) => Promise<T>): Promise<T> {
    const execucao = this.fila.then(async () => {
      const tx = new TransacaoFalsa(this)
      const r = await fn(tx)
      tx.aplicar()
      return r
    })
    this.fila = execucao.catch(() => undefined)
    return execucao
  }

  /** Atalhos de teste. */
  dados(caminho: string) { return this.docs.get(caminho) }
  colecaoInteira(nome: string): Array<Dados & { id: string }> {
    return [...this.docs.entries()].filter(([p]) => p.startsWith(`${nome}/`)).map(([p, d]) => ({ ...d, id: p.slice(nome.length + 1) }))
  }
}

export class TransacaoFalsa {
  private readonly ops: Array<() => void> = []
  private escreveu = false
  constructor(private readonly db: FirestoreFalso) {}
  async get(alvo: DocRefFalso | QueryFalsa) {
    if (this.escreveu) throw new Error('Firestore: leituras da transação devem vir antes das escritas.')
    return alvo instanceof DocRefFalso ? this.db.ler(alvo) : this.db.consultar(alvo)
  }
  set(ref: DocRefFalso, dados: Dados, opcoes?: { merge?: boolean }) { this.escreveu = true; this.ops.push(() => this.db.gravar(ref, dados, opcoes)); return this }
  update(ref: DocRefFalso, dados: Dados) { this.escreveu = true; this.ops.push(() => this.db.atualizar(ref, dados)); return this }
  create(ref: DocRefFalso, dados: Dados) {
    this.escreveu = true
    this.ops.push(() => {
      if (this.db.docs.has(ref.path)) throw new Error(`ALREADY_EXISTS: ${ref.path}`)
      this.db.gravar(ref, dados)
    })
    return this
  }
  aplicar() { this.ops.forEach((op) => op()) }
}
