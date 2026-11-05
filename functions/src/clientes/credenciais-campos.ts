/**
 * Logins e senhas de portal do cliente (prefeitura, posto fiscal, PIN do
 * certificado, Meu Gov, e-CAC) — FONTE ÚNICA da lista.
 *
 * Desde 2026-11-05 vivem em `clientes_credenciais/{clienteId}` (legível só por
 * admin e fiscal), não mais em `clientes` (legível por qualquer usuário ativo).
 * Em `clientes` fica só `credenciaisPreenchidas`: os NOMES dos campos
 * preenchidos, sem valor, para a ficha e o relatório mostrarem
 * "preenchida/em branco" a quem não pode ver a senha.
 *
 * Importado pelo front (src/lib/clientes-import.ts) e pelo trigger
 * sincronizarCredenciaisPreenchidas; espelhado em firestore.rules
 * (camposCredencialCliente) e em scripts/migrar-credenciais-clientes.mjs.
 */
export const CAMPOS_CREDENCIAL_LISTA = [
  'loginPrefeitura',
  'senhaWebPrefeitura',
  'senhaPinCertificadoDigitalECnpj',
  'loginPostoFiscal',
  'senhaPostoFiscal',
  'responsavelSenhaMeuGov',
  'responsavelSenhaEcacPf',
  'responsavelSenhaWebPrefeitura',
  'responsavelSenhaPinCertificadoDigitalCpf',
] as const

export type CampoCredencial = (typeof CAMPOS_CREDENCIAL_LISTA)[number]

const preenchido = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : v != null)

/** Nomes dos campos de credencial com valor, na ordem canônica. */
export function camposPreenchidos(dados: Record<string, unknown> | null | undefined): CampoCredencial[] {
  if (!dados) return []
  return CAMPOS_CREDENCIAL_LISTA.filter((k) => preenchido(dados[k]))
}
