export interface ClienteOpcao {
  id: string
  razaoSocial: string
  nomeFantasia?: string | null
  cpfCnpj?: string | null
}

/**
 * Texto indexado pelo filtro do ClientePicker: razão social, nome fantasia e o
 * documento com e sem pontuação — quem cola "12.345.678/0001-90" e quem digita
 * "12345678" encontram o mesmo cliente. O id entra no fim para desempatar
 * clientes homônimos (o cmdk usa o value como chave).
 */
export function termosBuscaCliente(c: ClienteOpcao): string {
  const digitos = (c.cpfCnpj ?? '').replace(/\D/g, '')
  return [c.razaoSocial, c.nomeFantasia, c.cpfCnpj, digitos, `#${c.id}`].filter(Boolean).join(' ')
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Filtro do <Command> do ClientePicker (retorna 1 = mostra, 0 = esconde).
 * O filtro padrão do cmdk é sensível a pontuação e acento: "11.222.333/0013"
 * não achava o CNPJ gravado só com dígitos, e "clinica" não achava "Clínica".
 * Aqui cada palavra da busca precisa aparecer no texto indexado; palavras que
 * são só documento (dígitos e . / -) comparam apenas os dígitos.
 */
export function filtrarCliente(valor: string, busca: string): number {
  // O `#id` só desempata homônimos — não pode casar com a busca.
  const texto = normalizar(valor).replace(/#\S+/g, ' ')
  const digitosTexto = texto.split(/\s+/).map((t) => t.replace(/\D/g, '')).filter(Boolean)
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean)
  return termos.every((termo) => {
    if (/^[\d./-]+$/.test(termo)) {
      const digitos = termo.replace(/\D/g, '')
      return digitos.length > 0 && digitosTexto.some((d) => d.includes(digitos))
    }
    return texto.includes(termo)
  }) ? 1 : 0
}
