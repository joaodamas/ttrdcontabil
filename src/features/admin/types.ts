import type { Timestamp } from 'firebase/firestore'

export type UsuarioAdmin = {
  id: string
  nome?: string
  email?: string
  perfil?: string
  ativo?: boolean
  telas?: string[]
  tenantId?: string
  ultimoAcesso?: Timestamp
}

export type ServicoAdmin = Record<string, unknown> & {
  id: string
  codigo?: string
  codigoNumero?: number
  nome?: string
  descricao?: string
  frequencia?: string
  valorPadrao?: number
  ativo?: boolean
}

export type ConectorFiscalAdmin = {
  id: string
  nome?: string
  municipio?: string | null
  uf?: string | null
  tipoIntegracao?: string
  urlPortal?: string | null
  ativo?: boolean
  homologado?: boolean
  producaoLiberada?: boolean
  emissao?: boolean
  consulta?: boolean
  cancelamento?: boolean
}

export type ParametrosEscritorio = {
  nomeEscritorio: string
  cnpjEscritorio: string
  emailAlertas: string
  tenantId: string
  diaVencimentoPadrao: number
  ambienteFiscalPadrao: 'homologacao' | 'producao'
}
