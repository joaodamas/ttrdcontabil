/**
 * Senhas de portal do cliente fora de `clientes`: helpers puros para separar,
 * juntar e saber o que está preenchido. O acesso ao Firestore fica em
 * src/features/clientes/credenciais.ts.
 *
 * Período de transição: até rodar scripts/migrar-credenciais-clientes.mjs, um
 * doc de cliente antigo ainda pode trazer os campos em texto puro ("legados").
 * Tudo aqui aceita os dois formatos.
 */
import {
  CAMPOS_CREDENCIAL_LISTA,
  camposPreenchidos,
  type CampoCredencial,
} from '../../functions/src/clientes/credenciais-campos'

export { CAMPOS_CREDENCIAL_LISTA, type CampoCredencial }

export type CredenciaisCliente = Partial<Record<CampoCredencial, string>>

const ehCampoCredencial = (k: string): k is CampoCredencial =>
  (CAMPOS_CREDENCIAL_LISTA as readonly string[]).includes(k)

/**
 * Tira as credenciais de um payload de cliente. `credenciais` traz TODOS os
 * campos de credencial presentes no payload (string vazia = apagar).
 */
export function separarCredenciais<T extends Record<string, unknown>>(payload: T): {
  dados: Record<string, unknown>
  credenciais: CredenciaisCliente
  temCredencial: boolean
} {
  const dados: Record<string, unknown> = {}
  const credenciais: CredenciaisCliente = {}
  let temCredencial = false
  for (const [k, v] of Object.entries(payload)) {
    if (ehCampoCredencial(k)) {
      temCredencial = true
      credenciais[k] = typeof v === 'string' ? v : v == null ? '' : String(v)
    } else {
      dados[k] = v
    }
  }
  return { dados, credenciais, temCredencial }
}

/** Credenciais em texto puro que ainda estão no doc do cliente (pré-migração). */
export function credenciaisLegadas(cliente: Record<string, unknown> | null | undefined): CredenciaisCliente {
  const out: CredenciaisCliente = {}
  if (!cliente) return out
  for (const k of camposPreenchidos(cliente)) out[k] = String(cliente[k])
  return out
}

/**
 * Campos de credencial preenchidos, sem precisar ler as senhas: a lista que o
 * trigger grava em `clientes.credenciaisPreenchidas`, mais o que ainda estiver
 * em texto puro no doc antigo.
 */
export function credenciaisPreenchidasDe(cliente: Record<string, unknown> | null | undefined): CampoCredencial[] {
  if (!cliente) return []
  const lista = Array.isArray(cliente.credenciaisPreenchidas)
    ? (cliente.credenciaisPreenchidas as unknown[]).filter((k): k is CampoCredencial => typeof k === 'string' && ehCampoCredencial(k))
    : []
  const legados = camposPreenchidos(cliente)
  const todos = new Set<CampoCredencial>([...lista, ...legados])
  return CAMPOS_CREDENCIAL_LISTA.filter((k) => todos.has(k))
}

/** Doc de credenciais por cima do legado: o doc novo vence campo a campo. */
export function juntarCredenciais(
  cliente: Record<string, unknown> | null | undefined,
  doc: Record<string, unknown> | null | undefined,
): CredenciaisCliente {
  const out = credenciaisLegadas(cliente)
  if (doc) {
    for (const k of CAMPOS_CREDENCIAL_LISTA) {
      if (k in doc) {
        const v = doc[k]
        if (typeof v === 'string' && v.trim() !== '') out[k] = v
        else delete out[k]
      }
    }
  }
  return out
}
