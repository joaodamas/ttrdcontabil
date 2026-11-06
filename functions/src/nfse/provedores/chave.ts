/**
 * Chave de acesso da NFS-e nacional (50 posições) — módulo leve, sem
 * node-forge/xml-crypto, para quem só precisa validar a chave (reconciliação,
 * ciclo) sem carregar o conector inteiro no boot da function.
 */
const PADRAO_CHAVE = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/

export function chaveAcessoValida(v: unknown): v is string {
  return typeof v === 'string' && PADRAO_CHAVE.test(v)
}
