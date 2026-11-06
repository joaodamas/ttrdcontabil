/**
 * Regras puras dos callables de senhas de portal (sem firebase): validação da
 * entrada, cifra campo a campo e leitura tolerante ao legado. Testado em
 * __tests__/lib/credenciais-callables.test.ts.
 */
import { CAMPOS_CREDENCIAL_LISTA, type CampoCredencial } from './credenciais-campos'

export const TAMANHO_MAXIMO_CREDENCIAL = 500

export class ErroCredencial extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroCredencial'
  }
}

const ehCampo = (k: string): k is CampoCredencial => (CAMPOS_CREDENCIAL_LISTA as readonly string[]).includes(k)

export function validarClienteId(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(valor)) {
    throw new ErroCredencial('clienteId inválido.')
  }
  return valor
}

/** `campos` opcional da leitura: só nomes conhecidos; vazio/ausente = todos. */
export function validarCamposLeitura(valor: unknown): CampoCredencial[] {
  if (valor == null) return [...CAMPOS_CREDENCIAL_LISTA]
  if (!Array.isArray(valor) || valor.length === 0) return [...CAMPOS_CREDENCIAL_LISTA]
  const campos = valor.filter((v): v is CampoCredencial => typeof v === 'string' && ehCampo(v))
  if (campos.length !== valor.length) throw new ErroCredencial('Campo de credencial desconhecido.')
  return CAMPOS_CREDENCIAL_LISTA.filter((k) => campos.includes(k))
}

/**
 * Entrada da gravação: { campo: texto } — texto vazio ou null apaga o campo.
 * Devolve o que gravar e o que apagar (nunca os dois para o mesmo campo).
 */
export function validarCredenciaisParaSalvar(valor: unknown): {
  gravar: Partial<Record<CampoCredencial, string>>
  apagar: CampoCredencial[]
} {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroCredencial('credenciais deve ser um objeto.')
  }
  const gravar: Partial<Record<CampoCredencial, string>> = {}
  const apagar: CampoCredencial[] = []
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!ehCampo(k)) throw new ErroCredencial(`Campo de credencial desconhecido: ${k}.`)
    if (v == null || (typeof v === 'string' && v.trim() === '')) {
      apagar.push(k)
      continue
    }
    if (typeof v !== 'string') throw new ErroCredencial(`Valor de ${k} deve ser texto.`)
    if (v.length > TAMANHO_MAXIMO_CREDENCIAL) throw new ErroCredencial(`Valor de ${k} longo demais.`)
    gravar[k] = v
  }
  return { gravar, apagar }
}

/** Formato do helper AES-256-GCM das functions (iv:authTag:ciphertext em hex). */
export function pareceCifrado(valor: string): boolean {
  const partes = valor.split(':')
  return partes.length === 3 && partes.every((p) => /^[0-9a-f]+$/i.test(p)) && partes[0].length === 24
}

/**
 * Campos do doc → texto puro. Valor cifrado passa pelo `decifrar`; valor em
 * texto puro (doc anterior à cifra, antes de rodar o script de migração) sai
 * como está. Valor que não decifra (chave trocada, dado corrompido) vira
 * `null` e entra em `ilegiveis` — melhor mostrar "não foi possível ler" do que
 * mostrar o texto cifrado como se fosse a senha.
 */
export function abrirCredenciais(
  doc: Record<string, unknown> | null | undefined,
  campos: readonly CampoCredencial[],
  decifrar: (cifrado: string) => string | null,
): { valores: Partial<Record<CampoCredencial, string>>; ilegiveis: CampoCredencial[] } {
  const valores: Partial<Record<CampoCredencial, string>> = {}
  const ilegiveis: CampoCredencial[] = []
  if (!doc) return { valores, ilegiveis }
  for (const k of campos) {
    const v = doc[k]
    if (typeof v !== 'string' || v.trim() === '') continue
    if (pareceCifrado(v)) {
      const aberto = decifrar(v)
      if (aberto == null) ilegiveis.push(k)
      else valores[k] = aberto
    } else {
      valores[k] = v
    }
  }
  return { valores, ilegiveis }
}

/** Campos em texto puro num doc (o que o script de migração precisa cifrar). */
export function camposEmTextoPuro(doc: Record<string, unknown> | null | undefined): CampoCredencial[] {
  if (!doc) return []
  return CAMPOS_CREDENCIAL_LISTA.filter((k) => {
    const v = doc[k]
    return typeof v === 'string' && v.trim() !== '' && !pareceCifrado(v)
  })
}
