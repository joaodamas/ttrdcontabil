export type ClienteRecord = Record<string, unknown> & {
  id: string
  razaoSocial?: string
  nomeFantasia?: string
  cpfCnpj?: string
  regimeTributario?: string
  cidade?: string
  uf?: string
  status?: string
  riscoInadimplencia?: boolean
}
