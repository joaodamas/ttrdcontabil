export type FechamentoRecord = {
  id: string
  clienteId: string
  clienteCodigo: number
  clienteNome: string
  regime: string
  responsavel: string
  portalUrl?: string
  formaEntrega?: string
  dasStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
  esocialStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
  reinfStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
  fgtsStatus: 'pendente' | 'enviado' | 'parcial' | 'ok' | 'sm' | 'guia' | 'na'
}

export type FechamentoFilters = {
  mes: number
  ano: number
  regime: string
}
