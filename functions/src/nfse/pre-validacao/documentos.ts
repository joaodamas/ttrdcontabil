/** CPF/CNPJ, e-mail e IBGE — PURO, usado pela pré-validação no navegador e no servidor. */

export function soDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '')
}

export function cpfValido(valor: unknown): boolean {
  const cpf = soDigitos(valor)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i)
  let dv = 11 - (soma % 11)
  if (dv >= 10) dv = 0
  if (dv !== Number(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i)
  dv = 11 - (soma % 11)
  if (dv >= 10) dv = 0
  return dv === Number(cpf[10])
}

export function cnpjValido(valor: unknown): boolean {
  const cnpj = soDigitos(valor)
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false
  const calc = (fatores: number[]) => {
    const soma = fatores.reduce((acc, f, i) => acc + Number(cnpj[i]) * f, 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13])
}

export function cpfCnpjValido(valor: unknown): boolean {
  const d = soDigitos(valor)
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false
}

export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
}

/**
 * CNPJ do titular de um e-CNPJ ICP-Brasil: o CN vem como "RAZÃO SOCIAL:CNPJ".
 * Devolve os 14 dígitos depois do último ':' (ou o único bloco de 14 dígitos
 * do texto); undefined quando o titular não traz CNPJ reconhecível.
 */
export function cnpjDoTitularCertificado(titular: unknown): string | undefined {
  const texto = String(titular ?? '')
  const aposDoisPontos = texto.includes(':') ? soDigitos(texto.slice(texto.lastIndexOf(':') + 1)) : ''
  if (aposDoisPontos.length === 14) return aposDoisPontos
  const blocos = texto.match(/\d{14}/g)
  return blocos && blocos.length === 1 ? blocos[0] : undefined
}
