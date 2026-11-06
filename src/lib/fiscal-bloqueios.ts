/**
 * Mensagens de bloqueio da prontidão fiscal (tela /fiscal → "Prontidão").
 * Curtas, acentuadas e acionáveis — o usuário vê exatamente estes textos.
 */
export const BLOQUEIO_FISCAL = {
  semServicoAtivo: 'Nenhum serviço ativo',
  diaEmissaoAusente: 'Falta dia de emissão da NFS-e',
  semConfiguracaoFiscal: 'Sem configuração fiscal',
  municipioAusente: 'Falta município emissor',
  inscricaoMunicipalAusente: 'Falta inscrição municipal',
  regimeAusente: 'Falta regime tributário',
  codigoServicoAusente: 'Falta código de serviço padrão',
  itemListaAusente: 'Falta item da lista de serviço',
  descricaoAusente: 'Falta descrição padrão da NFS-e',
  aliquotaAusente: 'Falta alíquota padrão',
  certificadoA1: 'Falta certificado A1 válido',
  municipioNaoEmiteNacional: 'Município não emite pelo Ambiente Nacional (sistema da prefeitura)',
} as const

/**
 * Texto compacto para a célula da tabela: até `max` bloqueios separados por
 * " · " e "+N" para o restante (a lista completa vai no `title`).
 */
export function resumirBloqueios(bloqueios: readonly string[], max = 3): string {
  if (bloqueios.length === 0) return 'Sem bloqueios'
  const visiveis = bloqueios.slice(0, max).join(' · ')
  const resto = bloqueios.length - max
  return resto > 0 ? `${visiveis} · +${resto}` : visiveis
}

const BLOQUEIOS_DO_CADASTRO: readonly string[] = [BLOQUEIO_FISCAL.semServicoAtivo, BLOQUEIO_FISCAL.diaEmissaoAusente]

/**
 * Onde se corrige cada bloqueio da prontidão: serviço e dia de emissão estão
 * no cadastro do cliente; o resto (município, certificado, inscrição,
 * alíquota…) na configuração fiscal (/clientes/<id>/fiscal).
 */
export function destinoBloqueio(bloqueio: string, clienteId: string): string {
  const id = encodeURIComponent(clienteId)
  return BLOQUEIOS_DO_CADASTRO.includes(bloqueio) ? `/clientes/${id}` : `/clientes/${id}/fiscal`
}
